import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  RefreshCw,
  Save,
  FileSpreadsheet,
  Users,
  GraduationCap,
  CalendarDays,
  FileText,
  Bookmark,
  History,
  RotateCcw,
  Trash2,
  ShieldCheck,
  Clock,
  AlertTriangle,
  X,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import {
  SystemBackupRecord,
  BackupDashboardMetrics,
  SYSTEM_BACKUPS_EVENT,
  AUTO_BACKUP_MAX_COUNT,
  backupData,
  fetchSystemBackups,
  fetchBackupDashboardMetrics,
  restoreSystemBackup,
  deleteSystemBackup,
  exportSystemBackupToExcel,
} from '../lib/backupStore';
import { getAppReleaseVersion } from '../lib/appVersion';
import { logAuditEvent, DEFAULT_SUPERADMIN_EMAIL } from '../lib/authWhitelist';
import type { Teacher, ClassTimetable } from '../lib/timetableUtils';

interface AdminBackupDashboardProps {
  currentOperatorEmail?: string;
  currentOperatorName?: string;
  onMessage?: (msg: string) => void;
  onRestored?: (result: { teachers: Teacher[]; classes: ClassTimetable[] }) => void;
}

function formatKstDateOnly(ms: number): string {
  try {
    const parts = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(ms));
    const y = parts.find((p) => p.type === 'year')?.value || '2026';
    const m = parts.find((p) => p.type === 'month')?.value || '01';
    const d = parts.find((p) => p.type === 'day')?.value || '01';
    return `${y}-${m}-${d}`;
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

function formatKstDateTime(ms: number): string {
  try {
    const parts = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(ms));
    const y = parts.find((p) => p.type === 'year')?.value || '2026';
    const m = parts.find((p) => p.type === 'month')?.value || '01';
    const d = parts.find((p) => p.type === 'day')?.value || '01';
    const hh = parts.find((p) => p.type === 'hour')?.value || '00';
    const mm = parts.find((p) => p.type === 'minute')?.value || '00';
    const ss = parts.find((p) => p.type === 'second')?.value || '00';
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  } catch {
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  }
}

export const AdminBackupDashboard: React.FC<AdminBackupDashboardProps> = ({
  currentOperatorEmail,
  currentOperatorName,
  onMessage,
  onRestored,
}) => {
  const [manualBackups, setManualBackups] = useState<SystemBackupRecord[]>([]);
  const [autoBackups, setAutoBackups] = useState<SystemBackupRecord[]>([]);
  const [metrics, setMetrics] = useState<BackupDashboardMetrics>({
    teacherCount: 0,
    classCount: 0,
    dutyAndMealAndWhitelistCount: 0,
    gateDutyMonths: 0,
    lunchDutyMonths: 0,
    mealMonths: 0,
    whitelistCount: 0,
    excludedAuditLogCount: 0,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCreatingManual, setIsCreatingManual] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [localBanner, setLocalBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // 2-Step Hard Confirm Restore Modal State
  const [restoreTarget, setRestoreTarget] = useState<SystemBackupRecord | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState<string>('');
  const [isRestoring, setIsRestoring] = useState<boolean>(false);

  // Delete Confirmation Modal State
  const [deleteTarget, setDeleteTarget] = useState<SystemBackupRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const releaseVersion = getAppReleaseVersion();
  const operatorEmail = currentOperatorEmail || DEFAULT_SUPERADMIN_EMAIL;
  const operatorName = currentOperatorName || '관리자';

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [backupGroups, liveMetrics] = await Promise.all([
        fetchSystemBackups(),
        fetchBackupDashboardMetrics(),
      ]);
      setManualBackups(backupGroups.manualBackups);
      setAutoBackups(backupGroups.autoBackups);
      setMetrics(liveMetrics);
    } catch (err) {
      console.error('Failed loading backup dashboard:', err);
      setLocalBanner({
        type: 'error',
        text: '백업 목록을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    const handleUpdated = () => {
      loadAll();
    };
    window.addEventListener(SYSTEM_BACKUPS_EVENT, handleUpdated);
    return () => {
      window.removeEventListener(SYSTEM_BACKUPS_EVENT, handleUpdated);
    };
  }, [loadAll]);

  const handleCreateManualSnapshot = async (customLabel?: string) => {
    if (isCreatingManual) return;
    setIsCreatingManual(true);
    setLocalBanner(null);
    try {
      const result = await backupData('manual', {
        createdBy: operatorEmail,
        label: customLabel || '수동 영구 스냅샷',
        reason: '관리자 확정 영구 스냅샷 생성',
      });

      if (result.created && result.backup) {
        await logAuditEvent({
          operatorId: operatorEmail,
          operatorName,
          action: '수동 영구 스냅샷 생성',
          target: result.backup.id,
          summary: `핵심 데이터 확정 영구 스냅샷 생성 (교원 ${result.backup.summary.teacherCount}명 · 학급 ${result.backup.summary.classCount}개반 · 감사로그 제외)`,
          category: 'system',
        }).catch(() => {});

        const msg = `중요 영구 보관함에 새 스냅샷이 안전하게 저장되었습니다. (교원 ${result.backup.summary.teacherCount}명 · 학급 ${result.backup.summary.classCount}개반 · auditLogs 제외)`;
        setLocalBanner({ type: 'success', text: msg });
        onMessage?.(msg);
        await loadAll();
      }
    } catch (err: any) {
      const errMsg = `영구 스냅샷 생성 중 오류가 발생했습니다: ${err?.message || '알 수 없는 오류'}`;
      setLocalBanner({ type: 'error', text: errMsg });
      onMessage?.(errMsg);
    } finally {
      setIsCreatingManual(false);
    }
  };

  const handleExportAllLiveExcel = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const filename = await exportSystemBackupToExcel();
      const msg = `전체 백업 엑셀 파일("${filename}")이 다운로드되었습니다.`;
      setLocalBanner({ type: 'success', text: msg });
      onMessage?.(msg);
    } catch (err: any) {
      const errMsg = `엑셀 내보내기 실패: ${err?.message || '오류'}`;
      setLocalBanner({ type: 'error', text: errMsg });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSingleBackupExcel = async (backup: SystemBackupRecord) => {
    try {
      const filename = await exportSystemBackupToExcel(backup);
      setLocalBanner({
        type: 'success',
        text: `선택한 스냅샷("${filename}") 엑셀 다운로드가 완료되었습니다.`,
      });
    } catch (err: any) {
      setLocalBanner({
        type: 'error',
        text: `엑셀 저장 실패: ${err?.message || '오류'}`,
      });
    }
  };

  const openRestoreModal = (backup: SystemBackupRecord) => {
    setRestoreTarget(backup);
    setRestoreConfirmText('');
  };

  const closeRestoreModal = () => {
    if (isRestoring) return;
    setRestoreTarget(null);
    setRestoreConfirmText('');
  };

  const executeHardConfirmedRestore = async () => {
    if (!restoreTarget || restoreConfirmText !== '복원합니다' || isRestoring) return;
    setIsRestoring(true);
    setLocalBanner(null);

    try {
      const restored = await restoreSystemBackup(restoreTarget);

      await logAuditEvent({
        operatorId: operatorEmail,
        operatorName,
        action: '시스템 백업 스냅샷 복원',
        target: restoreTarget.id,
        summary: `[${restoreTarget.backupType === 'manual' ? '수동 영구 스냅샷' : '자동 순환 백업'}] (${formatKstDateTime(restoreTarget.createdAt)}) 시점으로 교원 ${restored.teachers.length}명 · 학급 ${restored.classes.length}개반 전체 데이터 복원 완료`,
        category: 'system',
      }).catch(() => {});

      onRestored?.({
        teachers: restored.teachers,
        classes: restored.classes,
      });

      const msg = `${formatKstDateTime(restoreTarget.createdAt)} 스냅샷으로 데이터 복원이 완료되었습니다. (교원 ${restored.teachers.length}명 · 학급 ${restored.classes.length}개반)`;
      setLocalBanner({ type: 'success', text: msg });
      onMessage?.(msg);
      setRestoreTarget(null);
      setRestoreConfirmText('');
      await loadAll();
    } catch (err: any) {
      const errMsg = `백업 복원 실행 중 오류가 발생했습니다: ${err?.message || '알 수 없는 오류'}`;
      setLocalBanner({ type: 'error', text: errMsg });
      onMessage?.(errMsg);
    } finally {
      setIsRestoring(false);
    }
  };

  const executeDeleteBackup = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteSystemBackup(deleteTarget.id);
      await logAuditEvent({
        operatorId: operatorEmail,
        operatorName,
        action: '백업 스냅샷 삭제',
        target: deleteTarget.id,
        summary: `${deleteTarget.backupType === 'manual' ? '수동 영구 스냅샷' : '자동 순환 백업'} (${formatKstDateTime(deleteTarget.createdAt)}) 삭제`,
        category: 'system',
      }).catch(() => {});

      setLocalBanner({
        type: 'success',
        text: `선택한 백업 스냅샷(${formatKstDateTime(deleteTarget.createdAt)})이 삭제되었습니다.`,
      });
      setDeleteTarget(null);
      await loadAll();
    } catch (err: any) {
      setLocalBanner({
        type: 'error',
        text: `스냅샷 삭제 실패: ${err?.message || '오류'}`,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const renderBackupRow = (b: SystemBackupRecord, isManual: boolean) => {
    const dateOnly = formatKstDateOnly(b.createdAt);
    const fullDateTime = formatKstDateTime(b.createdAt);
    const teacherCount = b.summary?.teacherCount ?? b.payload?.teachers?.length ?? 0;
    const classCount = b.summary?.classCount ?? b.payload?.classes?.length ?? 0;
    const dutyAndMealCount = b.summary?.dutyAndMealCount ?? 0;
    const whitelistCount = b.summary?.whitelistCount ?? b.payload?.whitelist?.length ?? 0;

    return (
      <div
        key={b.id}
        className={`rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3.5 transition ${
          isManual
            ? 'bg-white border border-amber-200/80 hover:border-amber-300 shadow-2xs'
            : 'bg-slate-50/70 hover:bg-white border border-slate-200/80 hover:border-blue-200 shadow-2xs'
        }`}
      >
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-sm font-black text-slate-900 tracking-tight tabular-nums">
              {dateOnly}
            </span>

            {isManual ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300/80">
                <ShieldCheck className="w-3 h-3 text-amber-600" />
                수동 영구 스냅샷
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                <Clock className="w-3 h-3 text-blue-600" />
                자동 순환 백업
              </span>
            )}

            {b.savedToFirebase !== false && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                Firebase DB
              </span>
            )}
            {b.savedToServerDisk && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                서버 디스크
              </span>
            )}
          </div>

          <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-relaxed">
            <span className="tabular-nums font-medium text-slate-600">생성: {fullDateTime}</span>
            <span className="text-slate-300">•</span>
            <span>
              교원 {teacherCount}명 · 학급 {classCount}개반 · 당직/식단 {dutyAndMealCount}건 · 승인계정{' '}
              {whitelistCount}명
            </span>
            <span className="text-slate-300">•</span>
            <span className="font-mono text-slate-500">{b.version || releaseVersion}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={() => openRestoreModal(b)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>불러와 복원하기</span>
          </button>

          <button
            type="button"
            onClick={() => handleExportSingleBackupExcel(b)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>엑셀 저장</span>
          </button>

          <button
            type="button"
            onClick={() => setDeleteTarget(b)}
            className="inline-flex items-center justify-center p-2 bg-rose-50 hover:bg-rose-100 text-rose-500 hover:text-rose-700 border border-rose-200/80 rounded-xl transition cursor-pointer shrink-0"
            title="백업 스냅샷 삭제"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Dark Navy Hero Panel */}
      <section className="rounded-3xl bg-gradient-to-br from-[#071636] via-[#0c2049] to-[#081a3d] text-white p-5 sm:p-6 shadow-xl border border-indigo-900/60">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/15 border border-amber-400/40 flex items-center justify-center shrink-0 mt-0.5 shadow-inner">
              <Database className="w-6 h-6 text-amber-300" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
                  서버 자동 순환 백업 · 영구 스냅샷 보관함
                </h2>
                <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/25 border border-indigo-400/40 text-indigo-200 text-[11px] font-bold font-mono">
                  {releaseVersion}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/35 text-emerald-300 text-[11px] font-bold">
                  <Clock className="w-3.5 h-3.5" />
                  변동 시 자동 순환 (1시간·최대 {AUTO_BACKUP_MAX_COUNT}개)
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                용량 및 비용 최적화를 위해 핵심 자산(교원·학급·당직·급식·승인계정)만 백업하며{' '}
                <strong className="text-amber-300 font-bold">
                  보안 감사 로그(auditLogs)는 백업에서 제외
                </strong>
                됩니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={loadAll}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>목록 새로고침</span>
            </button>

            <button
              type="button"
              onClick={() => handleCreateManualSnapshot('수동 영구 스냅샷')}
              disabled={isCreatingManual}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-950/50 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isCreatingManual ? '저장 중...' : '지금 서버에 백업 저장'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportAllLiveExcel}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-950/40 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{isExporting ? '생성 중...' : '전체 백업 엑셀 다운로드'}</span>
            </button>
          </div>
        </div>

        {/* 4 Live KPI Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-5">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-slate-300">교원 시간표 (백업 대상)</div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-white tabular-nums">
                  {metrics.teacherCount}
                </span>
                <span className="text-xs text-slate-400 font-semibold">명</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-indigo-300" />
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-slate-300">학급 시간표 (백업 대상)</div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-emerald-300 tabular-nums">
                  {metrics.classCount}
                </span>
                <span className="text-xs text-slate-400 font-semibold">개반</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
              <GraduationCap className="w-4 h-4 text-emerald-300" />
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-slate-300">
                당직·급식·승인계정 (백업 대상)
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-amber-300 tabular-nums">
                  {metrics.dutyAndMealAndWhitelistCount}
                </span>
                <span className="text-xs text-slate-400 font-semibold">건</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shrink-0">
              <CalendarDays className="w-4 h-4 text-amber-300" />
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-slate-300">보안 감사 로그 (백업 제외)</div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-200 tabular-nums">
                  {metrics.excludedAuditLogCount}
                </span>
                <span className="text-xs text-slate-400 font-semibold">건</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-slate-500/20 border border-slate-400/30 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-slate-300" />
            </div>
          </div>
        </div>
      </section>

      {/* Local Operation Status Banner */}
      {localBanner && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            localBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {localBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{localBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setLocalBanner(null)}
            className="text-current opacity-60 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pinned Top Section: 중요 영구 보관함 (backupType === 'manual' ONLY) */}
      <section className="rounded-3xl bg-amber-50/75 border-2 border-amber-300/90 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  중요 영구 보관함 ({manualBackups.length}건)
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                  자동 삭제 제외 · 영구 보존 (manual)
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                관리자가 직접 확정 생성한 수동 영구 스냅샷입니다. 10개 초과 자동 순환 정리 대상에서 완전히 제외됩니다.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleCreateManualSnapshot('수동 영구 스냅샷')}
            disabled={isCreatingManual}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{isCreatingManual ? '생성 중...' : '+ 영구 스냅샷 추가 생성'}</span>
          </button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-amber-800/70 font-medium bg-white/60 rounded-2xl border border-amber-200/70">
            영구 보관함 데이터를 불러오는 중입니다...
          </div>
        ) : manualBackups.length === 0 ? (
          <div className="py-8 px-4 text-center text-xs text-amber-900/80 bg-white/70 rounded-2xl border border-dashed border-amber-300 space-y-1.5">
            <p className="font-bold text-sm text-amber-950">아직 생성된 수동 영구 스냅샷이 없습니다.</p>
            <p className="text-amber-800/80">
              우측의 &apos;+ 영구 스냅샷 추가 생성&apos; 또는 상단 &apos;확정 스냅샷 생성&apos; 버튼을 눌러 현재 데이터를 영구 보존하세요.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {manualBackups.map((b) => renderBackupRow(b, true))}
          </div>
        )}
      </section>

      {/* Bottom Regular Section: 자동 순환 백업 보관함 (backupType === 'auto' ONLY) */}
      <section className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  자동 순환 백업 보관함 ({autoBackups.length} / {AUTO_BACKUP_MAX_COUNT}건)
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-bold">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  변동 시 자동 생성 · 1시간 중복 방지 (auto)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                교원·학급 시간표, 당직·급식, 승인 계정 변경 직후 자동으로 저장되며 최신 {AUTO_BACKUP_MAX_COUNT}개만 순환 유지됩니다.
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-slate-200/70">
            자동 백업 이력을 불러오는 중입니다...
          </div>
        ) : autoBackups.length === 0 ? (
          <div className="py-8 px-4 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-1">
            <p className="font-bold text-sm text-slate-700">저장된 자동 순환 백업 이력이 아직 없습니다.</p>
            <p>데이터 추가·수정·삭제 작업이 발생하면 1시간 간격으로 자동 백업이 생성되어 최신순으로 표시됩니다.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {autoBackups.map((b) => renderBackupRow(b, false))}
          </div>
        )}
      </section>

      {/* 2-Step Hard Confirm Restore Modal */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    데이터 전체 복원 최종 확인
                  </h3>
                  <p className="text-xs text-slate-500">
                    실수 방지를 위한 2단계 안전 확인 절차입니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeRestoreModal}
                disabled={isRestoring}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">대상 스냅샷 구분</span>
                <span
                  className={`font-bold px-2 py-0.5 rounded-md ${
                    restoreTarget.backupType === 'manual'
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {restoreTarget.backupType === 'manual' ? '수동 영구 스냅샷' : '자동 순환 백업'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">생성 일시</span>
                <span className="font-bold text-slate-800 tabular-nums">
                  {formatKstDateTime(restoreTarget.createdAt)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">포함 데이터</span>
                <span className="font-semibold text-slate-800">
                  교원 {restoreTarget.summary?.teacherCount ?? 0}명 · 학급{' '}
                  {restoreTarget.summary?.classCount ?? 0}개반 · 당직/식단{' '}
                  {restoreTarget.summary?.dutyAndMealCount ?? 0}건
                </span>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 text-xs text-rose-900 leading-relaxed">
              <strong className="font-bold">주의:</strong> 복원을 실행하면 현재 운영 중인 시간표·당직·급식·승인 계정 데이터가 위 스냅샷 시점으로 덮어씌워집니다.
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                계속 진행하려면 아래 입력창에{' '}
                <span className="text-rose-600 underline decoration-rose-400">복원합니다</span> 를
                정확히 입력하세요.
              </label>
              <input
                type="text"
                value={restoreConfirmText}
                onChange={(e) => setRestoreConfirmText(e.target.value)}
                placeholder="복원합니다"
                disabled={isRestoring}
                autoFocus
                className="w-full px-3.5 py-2.5 text-sm font-bold border-2 border-slate-300 focus:border-emerald-600 rounded-xl outline-none transition placeholder:font-normal placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={closeRestoreModal}
                disabled={isRestoring}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={executeHardConfirmedRestore}
                disabled={restoreConfirmText !== '복원합니다' || isRestoring}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:cursor-not-allowed"
              >
                {isRestoring ? '복원 실행 중...' : '복원 실행'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">백업 스냅샷 삭제</h3>
                <p className="text-xs text-slate-500">삭제된 스냅샷은 되돌릴 수 없습니다.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              {deleteTarget.backupType === 'manual' ? (
                <strong className="text-amber-700">[수동 영구 스냅샷] </strong>
              ) : (
                <strong className="text-blue-700">[자동 순환 백업] </strong>
              )}
              <span className="tabular-nums">{formatKstDateTime(deleteTarget.createdAt)}</span>{' '}
              스냅샷을 영구 삭제하시겠습니까?
            </p>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={executeDeleteBackup}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? '삭제 중...' : '삭제 실행'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
