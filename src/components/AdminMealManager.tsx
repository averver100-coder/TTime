import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  UtensilsCrossed, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  FileDown, 
  Save, 
  Calendar,
  AlertCircle,
  Upload,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { MealDay, MealMonthRecord } from '../types/meal';
import { 
  fetchMealMonth, 
  saveMealMonth, 
  exportMealsToExcel,
  parseMealExcel,
  downloadMealTemplateExcel
} from '../lib/mealStore';
import { getKSTDate } from '../lib/gateDutyStore';

interface AdminMealManagerProps {
  onMessage?: (msg: string) => void;
}

export const AdminMealManager: React.FC<AdminMealManagerProps> = ({ onMessage }) => {
  const kst = getKSTDate();
  const [selectedYear, setSelectedYear] = useState<number>(kst.year);
  const [selectedMonth, setSelectedMonth] = useState<number>(kst.month);
  const [record, setRecord] = useState<MealMonthRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadLoading, setUploadLoading] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [showUploadArea, setShowUploadArea] = useState<boolean>(false);
  const [previewRecord, setPreviewRecord] = useState<MealMonthRecord | null>(null);

  // Editing single day
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editDayOfWeek, setEditDayOfWeek] = useState<string>('월요일');
  const [editMenuItems, setEditMenuItems] = useState<string>('');
  const [editNote, setEditNote] = useState<string>('');
  const [editCalories, setEditCalories] = useState<string>('');

  // Add new day
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
  const [newDayNum, setNewDayNum] = useState<number>(1);
  const [newDayOfWeek, setNewDayOfWeek] = useState<string>('월요일');
  const [newMenuItems, setNewMenuItems] = useState<string>('');
  const [newNote, setNewNote] = useState<string>('');

  const yearMonthString = useMemo(() => {
    return `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchMealMonth(yearMonthString);
        if (isMounted) {
          setRecord(data);
        }
      } catch (err) {
        console.error('Failed to load meal data in admin:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [yearMonthString]);

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear(y => y - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear(y => y + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth(m => m + 1);
    }
  };

  // Upload and parse Excel / NEIS / Image / PDF
  const handleProcessFile = async (file: File) => {
    if (!file) return;
    setUploadLoading(true);

    try {
      let parsedRecord: MealMonthRecord | null = null;

      // 1. Try server-side smart AI parser first (supports PDF, Image scan, complex layouts)
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('year', String(selectedYear));
        formData.append('month', String(selectedMonth));

        const res = await fetch('/api/parse-meal', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const json = await res.json();
          if (json.success && json.record && Array.isArray(json.record.meals) && json.record.meals.length > 0) {
            parsedRecord = json.record;
          }
        }
      } catch (serverErr) {
        console.warn('Server meal parse fallback to client-side XLSX parser:', serverErr);
      }

      // 2. Client-side XLSX parser fallback for spreadsheet files
      if (!parsedRecord && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
        parsedRecord = parseMealExcel(wb, selectedYear, selectedMonth);
      }

      if (!parsedRecord || !parsedRecord.meals || parsedRecord.meals.length === 0) {
        throw new Error('파일에서 유효한 식단 정보를 추출하지 못했습니다. 파일 내용 및 서식을 확인해 주세요.');
      }

      // Show preview modal before applying
      setPreviewRecord(parsedRecord);
    } catch (err) {
      console.error('Meal upload error:', err);
      const msg = err instanceof Error ? err.message : '식단 엑셀 파일 업로드 중 오류가 발생했습니다.';
      alert(msg);
      onMessage?.(msg);
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const applyParsedRecord = async (parsed: MealMonthRecord) => {
    setLoading(true);
    try {
      if (parsed.year && parsed.month) {
        setSelectedYear(parsed.year);
        setSelectedMonth(parsed.month);
      }

      setRecord(parsed);
      setPreviewRecord(null);
      setShowUploadArea(false);

      const ok = await saveMealMonth(parsed);
      const msg = `${parsed.year}년 ${parsed.month}월 식단표(총 ${parsed.meals.length}일치)가 성공적으로 저장되었습니다!`;
      if (ok) {
        onMessage?.(msg);
        alert(msg);
      } else {
        onMessage?.('식단 데이터가 로컬에 저장되었습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    downloadMealTemplateExcel(selectedYear, selectedMonth);
    onMessage?.(`${selectedYear}년 ${selectedMonth}월 식단표 엑셀 양식을 다운로드했습니다.`);
  };

  const startEdit = (meal: MealDay) => {
    setEditingDayId(meal.id);
    setEditDate(meal.date);
    setEditDayOfWeek(meal.dayOfWeek || '월요일');
    setEditMenuItems(meal.menuItems.join(', '));
    setEditNote(meal.note || '');
    setEditCalories(meal.calories || '');
  };

  const cancelEdit = () => {
    setEditingDayId(null);
  };

  const saveEdit = async () => {
    if (!record || !editingDayId) return;

    const items = editMenuItems
      .split(/,|\n/)
      .map(s => s.trim())
      .filter(Boolean);

    const updatedMeals = record.meals.map(m => {
      if (m.id === editingDayId) {
        return {
          ...m,
          dayOfWeek: editDayOfWeek,
          menuItems: items,
          note: editNote.trim(),
          calories: editCalories.trim()
        };
      }
      return m;
    });

    const updatedRecord: MealMonthRecord = {
      ...record,
      meals: updatedMeals
    };

    setRecord(updatedRecord);
    setEditingDayId(null);

    const success = await saveMealMonth(updatedRecord);
    if (success) {
      onMessage?.('식단 데이터가 성공적으로 저장되었습니다.');
    } else {
      onMessage?.('저장 중 일부 오류가 발생했을 수 있습니다.');
    }
  };

  const deleteMealDay = async (id: string) => {
    if (!record) return;
    if (!window.confirm('해당 일자의 식단 데이터를 삭제하시겠습니까?')) return;

    const updatedMeals = record.meals.filter(m => m.id !== id);
    const updatedRecord: MealMonthRecord = {
      ...record,
      meals: updatedMeals
    };

    setRecord(updatedRecord);
    const success = await saveMealMonth(updatedRecord);
    if (success) {
      onMessage?.('해당 일자의 식단이 삭제되었습니다.');
    }
  };

  const handleAddNewMeal = async () => {
    if (!record) return;

    const padMonth = String(selectedMonth).padStart(2, '0');
    const padDay = String(newDayNum).padStart(2, '0');
    const dateStr = `${selectedYear}-${padMonth}-${padDay}`;

    const items = newMenuItems
      .split(/,|\n/)
      .map(s => s.trim())
      .filter(Boolean);

    const newEntry: MealDay = {
      id: dateStr,
      date: dateStr,
      month: selectedMonth,
      day: newDayNum,
      dayOfWeek: newDayOfWeek,
      menuItems: items,
      note: newNote.trim()
    };

    // Replace or add
    const filtered = record.meals.filter(m => m.date !== dateStr);
    const sorted = [...filtered, newEntry].sort((a, b) => a.day - b.day);

    const updatedRecord: MealMonthRecord = {
      ...record,
      meals: sorted
    };

    setRecord(updatedRecord);
    setIsAddingNew(false);
    setNewMenuItems('');
    setNewNote('');

    const success = await saveMealMonth(updatedRecord);
    if (success) {
      onMessage?.(`${selectedMonth}월 ${newDayNum}일 식단이 등록되었습니다.`);
    }
  };

  const handleExport = () => {
    if (!record || record.meals.length === 0) {
      alert('내보낼 식단 데이터가 없습니다.');
      return;
    }
    exportMealsToExcel(record);
    onMessage?.('식단표 엑셀 파일 다운로드를 시작합니다.');
  };

  return (
    <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-orange-500" />
            <span>월간 학교 급식 식단 관리</span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            월별 학교 급식 메뉴 및 시험기간(중간고사 등) 일정을 조회하고 수정할 수 있습니다.
          </p>
        </div>

        {/* Month Selector & Action Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center bg-gray-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg hover:bg-white text-gray-600 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-sm font-extrabold text-gray-800">
              {selectedYear}년 {selectedMonth}월
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg hover:bg-white text-gray-600 transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv, .pdf, image/*"
            className="hidden"
            onChange={handleFileInputChange}
          />

          <button
            type="button"
            onClick={() => setShowUploadArea(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              showUploadArea 
                ? 'bg-orange-600 text-white shadow-sm' 
                : 'bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>식단 엑셀 업로드</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition cursor-pointer"
            title="식단표를 쉽게 입력할 수 있는 엑셀 표준 서식을 다운로드합니다."
          >
            <Download className="w-3.5 h-3.5" />
            <span>양식 다운로드</span>
          </button>

          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>엑셀 다운로드</span>
          </button>
        </div>
      </div>

      {/* Excel Upload Area (Collapsible / Banner) */}
      {showUploadArea && (
        <div className="p-5 bg-gradient-to-br from-orange-50/80 via-white to-amber-50/50 rounded-2xl border-2 border-dashed border-orange-300 transition-all space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-orange-100 text-orange-600 rounded-xl">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                  <span>월간 식단표 파일(Excel/나이스/PDF) 일괄 업로드</span>
                  <span className="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-bold">
                    자동 분석
                  </span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  나이스(NEIS) 다운로드 엑셀, 표준 식단 엑셀 표, 달력형 식단표 등 다양한 형태를 자동으로 인식합니다.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowUploadArea(false)}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
              isDragging 
                ? 'border-orange-500 bg-orange-100/50 scale-[0.99]' 
                : 'border-orange-200 bg-white hover:border-orange-400 hover:bg-orange-50/30'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadLoading ? (
              <div className="py-4 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
                <p className="text-sm font-bold text-gray-700">식단 파일을 분석하고 있습니다...</p>
                <p className="text-xs text-gray-400">메뉴 목록과 알레르기 정보, 비고 일정을 정제하는 중입니다.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="mx-auto w-12 h-12 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-sm font-bold text-gray-700">
                  식단 엑셀 파일(.xlsx, .xls, .csv)을 이곳에 끌어다 놓거나 클릭하세요
                </div>
                <p className="text-xs text-gray-400">
                  PDF 또는 스캔 이미지 식단표도 첨부하여 스마트 AI로 분석할 수 있습니다.
                </p>
                <div className="pt-2 flex items-center justify-center gap-2 text-xs">
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg font-medium">
                    .xlsx
                  </span>
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg font-medium">
                    .xls
                  </span>
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg font-medium">
                    .csv
                  </span>
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg font-medium">
                    NEIS 나이스 양식
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-orange-50/60 p-3 rounded-xl border border-orange-200/80 flex items-start gap-2.5 text-xs text-orange-950">
            <HelpCircle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-bold">업로드 안내 팁</p>
              <ul className="list-disc pl-4 space-y-0.5 text-orange-900/90 text-[11px]">
                <li><strong>나이스(NEIS) 식단표</strong>: 요리명 뒤에 적힌 알레르기 번호(예: (5.6.13))는 자동으로 정제되어 깔끔한 메뉴명만 등록됩니다.</li>
                <li><strong>달력형 식단표</strong>: 월~금 요일 컬럼 형태의 표도 일자와 식단을 스마트하게 추출합니다.</li>
                <li><strong>서식 작성</strong>: 상단의 <strong>'양식 다운로드'</strong> 버튼을 클릭하여 미리 제공되는 표준 엑셀에 메뉴를 복사해 넣으면 가장 안전하게 등록됩니다.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Add New Day & Status Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 font-medium">
          등록된 식단: <strong>{record?.meals.length || 0}일</strong>
        </span>

        <div className="flex items-center gap-2">
          {!showUploadArea && (
            <button
              type="button"
              onClick={() => setShowUploadArea(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-orange-500" />
              <span>엑셀 일괄 업로드</span>
            </button>
          )}

          {!isAddingNew && (
            <button
              type="button"
              onClick={() => setIsAddingNew(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>식단 추가/수정</span>
            </button>
          )}
        </div>
      </div>

      {/* Add New Day Form */}
      {isAddingNew && (
        <div className="p-4 bg-orange-50/60 rounded-xl border border-orange-200 space-y-3">
          <h4 className="text-xs font-bold text-orange-900 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />
            <span>새 일자 식단 입력</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-[11px] font-bold text-gray-600 block mb-1">일자(일)</label>
              <input
                type="number"
                min={1}
                max={31}
                value={newDayNum}
                onChange={e => setNewDayNum(parseInt(e.target.value, 10) || 1)}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-600 block mb-1">요일</label>
              <select
                value={newDayOfWeek}
                onChange={e => setNewDayOfWeek(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white"
              >
                <option value="월요일">월요일</option>
                <option value="화요일">화요일</option>
                <option value="수요일">수요일</option>
                <option value="목요일">목요일</option>
                <option value="금요일">금요일</option>
                <option value="토요일">토요일</option>
                <option value="일요일">일요일</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-[11px] font-bold text-gray-600 block mb-1">비고 (예: 중간고사)</label>
              <input
                type="text"
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="비고가 있을 경우 입력 (예: 중간고사)"
                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-600 block mb-1">
              메뉴 목록 (쉼표(,) 또는 줄바꿈으로 구분)
            </label>
            <input
              type="text"
              value={newMenuItems}
              onChange={e => setNewMenuItems(e.target.value)}
              placeholder="예: 발아현미밥, 아욱된장국, 고추장닭조림, 참나물 생채, 감자채볶음"
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded-lg"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleAddNewMeal}
              className="px-3 py-1 text-xs bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg"
            >
              등록하기
            </button>
          </div>
        </div>
      )}

      {/* Table of Days */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-700 border-b border-gray-200 font-bold">
              <th className="py-2.5 px-3 w-20">일자</th>
              <th className="py-2.5 px-3 w-16">요일</th>
              <th className="py-2.5 px-3">식단 메뉴 목록</th>
              <th className="py-2.5 px-3 w-24">비고</th>
              <th className="py-2.5 px-3 w-24 text-center">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-400">
                  식단 데이터를 불러오는 중입니다...
                </td>
              </tr>
            ) : !record || record.meals.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-400">
                  등록된 식단이 없습니다. 위의 '식단 추가/수정' 버튼으로 등록할 수 있습니다.
                </td>
              </tr>
            ) : (
              record.meals.map(m => {
                const isEditing = editingDayId === m.id;
                return (
                  <tr key={m.id} className="hover:bg-orange-50/30 transition">
                    <td className="py-2 px-3 font-bold text-gray-800">
                      {m.day}일
                    </td>
                    <td className="py-2 px-3 text-gray-600">
                      {m.dayOfWeek || ''}
                    </td>
                    <td className="py-2 px-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editMenuItems}
                          onChange={e => setEditMenuItems(e.target.value)}
                          placeholder="메뉴 쉼표 구분"
                          className="w-full text-xs px-2 py-1 border border-orange-300 rounded-md"
                        />
                      ) : m.menuItems && m.menuItems.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {m.menuItems.map((item, idx) => (
                            <span
                              key={idx}
                              className="bg-orange-50 text-orange-900 border border-orange-200 text-[11px] px-2 py-0.5 rounded-md font-medium"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">메뉴 없음</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editNote}
                          onChange={e => setEditNote(e.target.value)}
                          placeholder="비고"
                          className="w-full text-xs px-2 py-1 border border-orange-300 rounded-md"
                        />
                      ) : m.note ? (
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] px-1.5 py-0.5 rounded font-bold">
                          {m.note}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={saveEdit}
                            className="p-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                            title="저장"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="p-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200"
                            title="취소"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(m)}
                            className="p-1 rounded text-gray-400 hover:text-orange-600 hover:bg-orange-50"
                            title="수정"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteMealDay(m.id)}
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Excel Upload Preview & Confirmation Modal */}
      {previewRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-orange-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-orange-500 text-white rounded-xl shadow-xs">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-gray-900">
                    식단 파일 분석 완료
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {previewRecord.year}년 {previewRecord.month}월 식단표 • 총 {previewRecord.meals.length}일치 식단 데이터가 추출되었습니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewRecord(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Scrollable Preview Table */}
            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <span>
                  <strong>[적용 및 저장]</strong>을 클릭하면 {previewRecord.year}년 {previewRecord.month}월 식단이 위 내용으로 업데이트되며, 학교 메인 화면에 즉시 반영됩니다.
                </span>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
                    <tr>
                      <th className="py-2 px-3 w-16">일자</th>
                      <th className="py-2 px-3 w-14">요일</th>
                      <th className="py-2 px-3">식단 메뉴 목록</th>
                      <th className="py-2 px-3 w-20">열량/비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewRecord.meals.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50/50">
                        <td className="py-2 px-3 font-bold text-gray-800">{m.day}일</td>
                        <td className="py-2 px-3 text-gray-600">{m.dayOfWeek}</td>
                        <td className="py-2 px-3">
                          {m.menuItems.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {m.menuItems.map((dish, i) => (
                                <span
                                  key={i}
                                  className="bg-orange-50 text-orange-800 border border-orange-200 text-[10px] px-1.5 py-0.5 rounded font-medium"
                                >
                                  {dish}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400 italic text-[11px]">식단 없음</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-[11px]">
                          {m.calories && <div className="text-gray-500 font-medium">{m.calories}</div>}
                          {m.note && <span className="bg-blue-50 text-blue-700 font-bold px-1 rounded">{m.note}</span>}
                          {!m.calories && !m.note && <span className="text-gray-300">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreviewRecord(null)}
                className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => applyParsedRecord(previewRecord)}
                className="flex items-center gap-1.5 px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>적용 및 클라우드 저장 ({previewRecord.meals.length}일)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
