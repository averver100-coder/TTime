import React, { useState, useEffect, useMemo } from 'react';
import { 
  History, Search, Filter, RotateCw, Download, FileSpreadsheet, 
  Calendar, User, CheckCircle, ShieldAlert, KeyRound, Clock, 
  ChevronLeft, ChevronRight, X
} from 'lucide-react';
import { AuditLog } from '../types/auth';
import { fetchAuditLogs } from '../lib/authWhitelist';
import * as XLSX from 'xlsx';

interface AdminAuditLogViewerProps {
  onMessage?: (msg: string) => void;
}

export const AdminAuditLogViewer: React.FC<AdminAuditLogViewerProps> = ({ onMessage }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | AuditLog['category']>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await fetchAuditLogs();
      setLogs(data);
    } catch (err) {
      console.warn('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    let list = [...logs];

    if (selectedCategory !== 'all') {
      list = list.filter(l => l.category === selectedCategory);
    }

    const q = searchTerm.trim().toLowerCase();
    if (q) {
      list = list.filter(l => 
        l.operatorId.toLowerCase().includes(q) ||
        (l.operatorName && l.operatorName.toLowerCase().includes(q)) ||
        l.action.toLowerCase().includes(q) ||
        (l.target && l.target.toLowerCase().includes(q)) ||
        l.summary.toLowerCase().includes(q)
      );
    }

    return list;
  }, [logs, selectedCategory, searchTerm]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  const handleExportExcel = () => {
    if (filteredLogs.length === 0) return;
    try {
      const rows = filteredLogs.map((l, idx) => ({
        '번호': idx + 1,
        '수정일시': new Date(l.timestamp).toLocaleString('ko-KR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
        '수정한 사람(ID/이메일)': l.operatorId,
        '작업자 성명': l.operatorName || '',
        '분류': l.category,
        '수행한 작업': l.action,
        '작업 대상': l.target || '',
        '변경된 내용 요약': l.summary,
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 8 },
        { wch: 22 },
        { wch: 26 },
        { wch: 14 },
        { wch: 12 },
        { wch: 20 },
        { wch: 20 },
        { wch: 45 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '감사로그_이력');
      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `상일미디어고_감사로그_${dateStr}.xlsx`);

      if (onMessage) onMessage('감사 로그가 엑셀 파일로 다운로드되었습니다.');
    } catch (err) {
      console.error('Failed to export audit logs:', err);
    }
  };

  const getCategoryBadge = (category: AuditLog['category']) => {
    switch (category) {
      case 'schedule':
      case 'teacher':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">교원/시간표</span>;
      case 'class':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">학급시간표</span>;
      case 'whitelist':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">화이트리스트</span>;
      case 'auth':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">보안로그인</span>;
      case 'duty':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">교문/급식</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-gray-100 text-gray-700 border border-gray-200">시스템</span>;
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            <span>변경 이력 및 감사 로그 (Audit Log)</span>
            <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-bold border border-indigo-200">
              총 {logs.length}건 기록됨
            </span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            수정한 사람의 고유 ID / 이메일, 수정일시, 수행한 작업 및 변경된 내용 요약을 실시간으로 투명하게 추적 및 보존합니다.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={loadLogs}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-xs font-bold transition cursor-pointer"
            title="새로고침"
          >
            <RotateCw className={`w-3.5 h-3.5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={filteredLogs.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer active:scale-95"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>로그 엑셀 다운로드</span>
          </button>
        </div>
      </div>

      {/* Search and Category Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-gray-100">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            placeholder="수정자 ID, 작업명, 대상, 변경 내용 검색..."
            className="w-full pl-9 pr-8 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <span className="text-gray-500 font-bold text-[11px] shrink-0">분류:</span>
          {(['all', 'teacher', 'class', 'whitelist', 'duty', 'auth'] as const).map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => { setSelectedCategory(cat); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer shrink-0 ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat === 'all' && '전체'}
              {cat === 'teacher' && '교원/시간표'}
              {cat === 'class' && '학급'}
              {cat === 'whitelist' && '화이트리스트'}
              {cat === 'duty' && '지도'}
              {cat === 'auth' && '로그인/보안'}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead className="bg-gray-50/90 text-gray-700 border-b border-gray-200">
              <tr>
                <th className="py-2.5 px-3 font-bold w-40">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-gray-500" />
                    <span>수정 일시 (Timestamp)</span>
                  </div>
                </th>
                <th className="py-2.5 px-3 font-bold w-48">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    <span>수정한 사람 (ID / 이메일)</span>
                  </div>
                </th>
                <th className="py-2.5 px-3 font-bold w-24">분류</th>
                <th className="py-2.5 px-3 font-bold w-36">수행한 작업</th>
                <th className="py-2.5 px-3 font-bold">변경된 내용 요약</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400 text-xs">
                    {searchTerm ? '검색 조건에 일치하는 감사 로그가 없습니다.' : '기록된 변경 이력이 없습니다.'}
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => {
                  const date = new Date(log.timestamp);
                  const isSuperadmin = log.operatorId === 'averver100@gmail.com';
                  return (
                    <tr key={log.id} className="hover:bg-indigo-50/30 transition">
                      <td className="py-2.5 px-3 whitespace-nowrap text-gray-600 font-mono text-[11px]">
                        {date.toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit'
                        })}{' '}
                        <span className="font-bold text-gray-900">
                          {date.toLocaleTimeString('ko-KR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col">
                          <span className={`font-bold font-mono text-xs ${isSuperadmin ? 'text-amber-800' : 'text-blue-900'}`}>
                            {log.operatorId}
                          </span>
                          {log.operatorName && (
                            <span className="text-[10px] text-gray-400">
                              {log.operatorName}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {getCategoryBadge(log.category)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-bold text-gray-900 text-xs">
                          {log.action}
                        </span>
                        {log.target && (
                          <div className="text-[10px] text-gray-500 font-medium truncate max-w-[140px]">
                            대상: {log.target}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-gray-800 text-xs leading-relaxed">
                        {log.summary}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-gray-50/80 px-4 py-2.5 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600">
            <div>
              총 {filteredLogs.length}건 중 {(currentPage - 1) * itemsPerPage + 1}~{Math.min(currentPage * itemsPerPage, filteredLogs.length)}건 표시
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 py-0.5 font-bold text-gray-700">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
