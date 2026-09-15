import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  Download, 
  Calendar, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ShieldCheck, 
  AlertCircle,
  RefreshCw,
  FileDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { GateDutyDay, GateDutyMonthRecord } from '../types/gateDuty';
import { 
  fetchGateDutyMonth, 
  saveGateDutyMonth, 
  parseGateDutyExcel, 
  exportGateDutyToExcel, 
  downloadGateDutyTemplateExcel,
  getKSTDate 
} from '../lib/gateDutyStore';
import { Teacher } from '../lib/timetableUtils';

interface AdminGateDutyManagerProps {
  teachers: Teacher[];
  onMessage?: (msg: string) => void;
}

export const AdminGateDutyManager: React.FC<AdminGateDutyManagerProps> = ({ teachers, onMessage }) => {
  const kst = getKSTDate();
  const [selectedYear, setSelectedYear] = useState<number>(kst.year);
  const [selectedMonth, setSelectedMonth] = useState<number>(kst.month);
  const [record, setRecord] = useState<GateDutyMonthRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  
  // Edit form state
  const [editDate, setEditDate] = useState<string>('');
  const [editDayOfWeek, setEditDayOfWeek] = useState<string>('월요일');
  const [editTeacher1, setEditTeacher1] = useState<string>('');
  const [editTeacher2, setEditTeacher2] = useState<string>('');
  const [editNote, setEditNote] = useState<string>('');

  // Add new day form toggle
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);

  const currentYearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  // Load duties when month changes
  const loadMonthDuties = async (ym: string) => {
    setLoading(true);
    try {
      const data = await fetchGateDutyMonth(ym);
      setRecord(data);
    } catch (err) {
      console.error('Failed to load duties for month:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonthDuties(currentYearMonth);
  }, [currentYearMonth]);

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

  // Upload and parse Excel / PDF / CSV
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      // First try server-side smart AI parser if available (supports PDF, Excel, Image)
      const formData = new FormData();
      formData.append('file', file);
      formData.append('year', String(selectedYear));
      formData.append('month', String(selectedMonth));

      let parsedRecord: GateDutyMonthRecord | null = null;

      try {
        const res = await fetch('/api/parse-gate-duty', {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.record && Array.isArray(json.record.duties)) {
            parsedRecord = json.record;
          }
        }
      } catch (err) {
        console.warn('Server parse fallback to client-side XLSX parser:', err);
      }

      // If server parser didn't succeed and it's an Excel file, parse client-side
      if (!parsedRecord && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
        parsedRecord = parseGateDutyExcel(wb, selectedYear, selectedMonth);
      }

      if (!parsedRecord || !parsedRecord.duties || parsedRecord.duties.length === 0) {
        throw new Error('파일에서 교문지도 일정을 추출하지 못했습니다. 파일 서식을 확인해 주세요.');
      }

      // If parsed record has year/month, update view if needed
      if (parsedRecord.year && parsedRecord.month) {
        setSelectedYear(parsedRecord.year);
        setSelectedMonth(parsedRecord.month);
      }

      // Save to server & Firestore
      await saveGateDutyMonth(parsedRecord);
      setRecord(parsedRecord);

      const msg = `${parsedRecord.year}년 ${parsedRecord.month}월 교문지도 명단(총 ${parsedRecord.duties.length}일)이 성공적으로 업로드 및 저장되었습니다!`;
      if (onMessage) onMessage(msg);
      window.alert(msg);
    } catch (err) {
      console.error('File upload failed:', err);
      const errMsg = err instanceof Error ? err.message : '교문지도 파일 업로드 중 오류가 발생했습니다.';
      if (onMessage) onMessage(errMsg);
      window.alert(errMsg);
    } finally {
      setLoading(false);
      // Reset input
      e.target.value = '';
    }
  };

  // Start editing single day
  const handleStartEdit = (day: GateDutyDay) => {
    setEditingDayId(day.id);
    setEditDate(day.date);
    setEditDayOfWeek(day.dayOfWeek || '월요일');
    setEditTeacher1(day.teachers[0] || '');
    setEditTeacher2(day.teachers[1] || '');
    setEditNote(day.note || '');
  };

  // Save edited day
  const handleSaveEdit = async () => {
    if (!record || !editingDayId) return;

    const teachersList = [editTeacher1.trim(), editTeacher2.trim()].filter(Boolean);
    if (teachersList.length === 0) {
      window.alert('최소 1명 이상의 지도교사 성함을 입력해주세요.');
      return;
    }

    const updatedDuties = record.duties.map(d => {
      if (d.id === editingDayId) {
        return {
          ...d,
          dayOfWeek: editDayOfWeek,
          teachers: teachersList,
          note: editNote.trim(),
        };
      }
      return d;
    });

    const updatedRecord: GateDutyMonthRecord = {
      ...record,
      duties: updatedDuties,
    };

    setLoading(true);
    try {
      await saveGateDutyMonth(updatedRecord);
      setRecord(updatedRecord);
      setEditingDayId(null);
      if (onMessage) onMessage('교문지도 배정이 수정되었습니다.');
    } catch (err) {
      window.alert('수정 사항 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Delete single day
  const handleDeleteDay = async (dayId: string) => {
    if (!record) return;
    if (!window.confirm('이 날짜의 교문 지도 배정을 삭제하시겠습니까?')) return;

    const updatedDuties = record.duties.filter(d => d.id !== dayId);
    const updatedRecord: GateDutyMonthRecord = {
      ...record,
      duties: updatedDuties,
    };

    setLoading(true);
    try {
      await saveGateDutyMonth(updatedRecord);
      setRecord(updatedRecord);
      if (onMessage) onMessage('선택한 날짜의 교문지도가 삭제되었습니다.');
    } catch (err) {
      window.alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Add new day duty
  const handleAddNewDay = async () => {
    if (!record) return;
    if (!editDate) {
      window.alert('날짜를 입력해주세요 (예: 2026-09-25)');
      return;
    }
    const teachersList = [editTeacher1.trim(), editTeacher2.trim()].filter(Boolean);
    if (teachersList.length === 0) {
      window.alert('최소 1명 이상의 지도교사 성함을 입력해주세요.');
      return;
    }

    const [y, m, d] = editDate.split('-').map(Number);
    const newDay: GateDutyDay = {
      id: editDate,
      date: editDate,
      year: y,
      month: m,
      day: d,
      dayOfWeek: editDayOfWeek,
      teachers: teachersList,
      note: editNote.trim(),
    } as GateDutyDay;

    // Insert and sort
    const existingIndex = record.duties.findIndex(d => d.date === editDate);
    let newDuties: GateDutyDay[];
    if (existingIndex >= 0) {
      newDuties = [...record.duties];
      newDuties[existingIndex] = newDay;
    } else {
      newDuties = [...record.duties, newDay].sort((a, b) => a.date.localeCompare(b.date));
    }

    const updatedRecord: GateDutyMonthRecord = {
      ...record,
      duties: newDuties,
    };

    setLoading(true);
    try {
      await saveGateDutyMonth(updatedRecord);
      setRecord(updatedRecord);
      setIsAddingNew(false);
      setEditDate('');
      setEditTeacher1('');
      setEditTeacher2('');
      setEditNote('');
      if (onMessage) onMessage('새로운 교문지도 배정이 추가되었습니다.');
    } catch (err) {
      window.alert('추가 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Excel download of current month
  const handleExportCurrentMonth = () => {
    if (!record || record.duties.length === 0) {
      window.alert('다운로드할 교문지도 데이터가 없습니다.');
      return;
    }
    exportGateDutyToExcel(record, `상일미디어고등학교_${record.year}년_${record.month}월_교문지도.xlsx`);
  };

  // Download blank template
  const handleDownloadTemplate = () => {
    downloadGateDutyTemplateExcel(selectedYear, selectedMonth);
  };

  return (
    <section className="bg-white border border-gray-200/90 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-snug">
              <div>월별 교문지도 선생님 명단 관리</div>
              <div>및 엑셀 업로드</div>
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              엑셀(.xlsx) 파일 또는 문서를 업로드하면 메인 화면의 [오늘의 교문 지도 선생님]에 실시간 반영됩니다.
            </p>
          </div>
        </div>

        {/* Month Selector */}
        <div className="inline-flex items-center gap-2 self-start sm:self-center bg-gray-50 p-1.5 rounded-xl border border-gray-200 whitespace-nowrap shrink-0">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1.5 hover:bg-white text-gray-600 hover:text-gray-900 rounded-lg transition"
            title="이전 달"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1.5 px-2 font-bold text-sm text-gray-800 whitespace-nowrap">
            <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>{selectedYear}년 {selectedMonth}월</span>
          </div>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 hover:bg-white text-gray-600 hover:text-gray-900 rounded-lg transition"
            title="다음 달"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Action Buttons & Upload Area */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Upload Box */}
        <label className="md:col-span-2 flex flex-col items-center justify-center border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/40 hover:bg-indigo-50/80 rounded-xl p-4 cursor-pointer transition group">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800 group-hover:text-indigo-700 transition">
                {selectedYear}년 {selectedMonth}월 교문지도 엑셀 파일 업로드
              </p>
              <p className="text-xs text-gray-500">
                .xlsx, .xls, .csv 지원 (일자, 지도교사 1/2, 비고 컬럼 자동 인식)
              </p>
            </div>
          </div>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.pdf,image/*"
            onChange={handleFileUpload}
            disabled={loading}
            className="hidden"
          />
        </label>

        {/* Template & Export Quick Buttons */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-xs font-bold rounded-xl transition shadow-2xs"
            title="날짜와 요일이 자동 채워진 빈 엑셀 양식을 다운로드합니다"
          >
            <FileDown className="w-4 h-4 text-indigo-600" />
            {selectedMonth}월 엑셀 양식 다운로드
          </button>

          <button
            type="button"
            onClick={handleExportCurrentMonth}
            disabled={!record || record.duties.length === 0}
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-xs disabled:opacity-50"
            title="현재 월의 등록된 교문지도 명단을 엑셀 파일로 저장합니다"
          >
            <FileSpreadsheet className="w-4 h-4 text-indigo-100" />
            현재 월 엑셀 다운로드
          </button>
        </div>
      </div>

      {/* Schedule Table Header with Add Button */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-bold text-gray-800">
            {selectedYear}년 {selectedMonth}월 배정 현황
          </h4>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold">
            총 {record?.duties.length || 0}일 배정됨
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsAddingNew(!isAddingNew);
            const mPad = String(selectedMonth).padStart(2, '0');
            setEditDate(`${selectedYear}-${mPad}-01`);
            setEditDayOfWeek('월요일');
            setEditTeacher1('');
            setEditTeacher2('');
            setEditNote('');
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg text-xs font-bold transition shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5 text-indigo-600" />
          날짜 직접 추가
        </button>
      </div>

      {/* Add New Day Form */}
      {isAddingNew && (
        <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-3">
          <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            새 날짜 교문 지도 배정 추가
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">날짜 (YYYY-MM-DD)</label>
              <input
                type="text"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                placeholder="예: 2026-09-14"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">요일</label>
              <select
                value={editDayOfWeek}
                onChange={e => setEditDayOfWeek(e.target.value)}
                className="w-full text-xs px-2 py-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="월요일">월요일</option>
                <option value="화요일">화요일</option>
                <option value="수요일">수요일</option>
                <option value="목요일">목요일</option>
                <option value="금요일">금요일</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">지도교사 1</label>
              <input
                type="text"
                value={editTeacher1}
                onChange={e => setEditTeacher1(e.target.value)}
                placeholder="예: 우현정"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">지도교사 2</label>
              <input
                type="text"
                value={editTeacher2}
                onChange={e => setEditTeacher2(e.target.value)}
                placeholder="예: 김우남"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">비고 (시험 등)</label>
              <input
                type="text"
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                placeholder="예: 중간고사"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-bold"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleAddNewDay}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs"
            >
              추가 저장
            </button>
          </div>
        </div>
      )}

      {/* Duty Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200 sticky top-0">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center">연번</th>
                <th className="py-2.5 px-3 w-32">일자(요일)</th>
                <th className="py-2.5 px-3">지도교사 1</th>
                <th className="py-2.5 px-3">지도교사 2</th>
                <th className="py-2.5 px-3">비고</th>
                <th className="py-2.5 px-3 w-24 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    데이터를 불러오는 중입니다...
                  </td>
                </tr>
              ) : !record || record.duties.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    <p className="font-semibold text-sm">등록된 교문지도 명단이 없습니다.</p>
                    <p className="text-xs text-gray-400 mt-1">상단의 파일 업로드를 통해 월별 배정표를 등록해주세요.</p>
                  </td>
                </tr>
              ) : (
                record.duties.map((duty, idx) => {
                  const isEditing = editingDayId === duty.id;
                  const mPad = String(duty.month).padStart(2, '0');
                  const dPad = String(duty.day).padStart(2, '0');

                  if (isEditing) {
                    return (
                      <tr key={duty.id} className="bg-indigo-50/50">
                        <td className="py-2 px-3 text-center font-bold text-gray-400">{idx + 1}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-mono">{mPad}/{dPad}</span>
                            <select
                              value={editDayOfWeek}
                              onChange={e => setEditDayOfWeek(e.target.value)}
                              className="text-xs bg-white border border-gray-300 rounded px-1 py-0.5"
                            >
                              <option value="월요일">월</option>
                              <option value="화요일">화</option>
                              <option value="수요일">수</option>
                              <option value="목요일">목</option>
                              <option value="금요일">금</option>
                            </select>
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={editTeacher1}
                            onChange={e => setEditTeacher1(e.target.value)}
                            className="w-full text-xs px-2 py-1 bg-white border border-gray-300 rounded outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={editTeacher2}
                            onChange={e => setEditTeacher2(e.target.value)}
                            className="w-full text-xs px-2 py-1 bg-white border border-gray-300 rounded outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={editNote}
                            onChange={e => setEditNote(e.target.value)}
                            className="w-full text-xs px-2 py-1 bg-white border border-gray-300 rounded outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              className="p-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                              title="저장"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingDayId(null)}
                              className="p-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                              title="취소"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={duty.id || duty.date} className="hover:bg-gray-50 transition">
                      <td className="py-2.5 px-3 text-center text-gray-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-medium text-gray-900">
                        {mPad}/{dPad}({duty.dayOfWeek || ''})
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-gray-800">
                        {duty.teachers[0] ? (
                          <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-gray-800">
                            {duty.teachers[0]}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-gray-800">
                        {duty.teachers[1] ? (
                          <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-gray-800">
                            {duty.teachers[1]}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">
                        {duty.note ? (
                          <span className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                            {duty.note}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(duty)}
                            className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                            title="수정"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDay(duty.id)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
