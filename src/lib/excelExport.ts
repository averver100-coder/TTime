import * as XLSX from 'xlsx';
import { Teacher, formatClassroomShort } from './timetableUtils';

export function exportTimetableToExcel(teachers: Teacher[], customFilename: string = '상일미디어고등학교 수업시간표.xlsx') {
  const wb = XLSX.utils.book_new();

  const days: Array<{ key: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri'; name: string; maxPeriod: number }> = [
    { key: 'Mon', name: '월', maxPeriod: 7 },
    { key: 'Tue', name: '화', maxPeriod: 7 },
    { key: 'Wed', name: '수', maxPeriod: 6 },
    { key: 'Thu', name: '목', maxPeriod: 6 },
    { key: 'Fri', name: '금', maxPeriod: 6 },
  ];

  // ==========================================
  // Sheet 1: 전체교사_종합시간표 (Master Grid Matrix)
  // ==========================================
  const headers: string[] = ['연번', '선생님 성함', '담임 학급', '주당 시수'];
  days.forEach(d => {
    for (let p = 1; p <= d.maxPeriod; p++) {
      headers.push(`${d.name} ${p}교시`);
    }
  });

  const matrixRows: (string | number)[][] = [headers];
  const sortedTeachers = [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  sortedTeachers.forEach((t, idx) => {
    let totalPeriods = 0;
    const periodValues: string[] = [];

    days.forEach(d => {
      const daySchedule = t.timetable?.[d.key] || {};
      for (let p = 1; p <= d.maxPeriod; p++) {
        const val = daySchedule[p];
        if (val && String(val).trim() !== '') {
          totalPeriods++;
          periodValues.push(formatClassroomShort(String(val)));
        } else {
          periodValues.push('');
        }
      }
    });

    const rowData: (string | number)[] = [
      idx + 1,
      t.name,
      t.homeroom ? `${t.homeroom}반` : '',
      totalPeriods > 0 ? `${totalPeriods}시간` : '-',
      ...periodValues
    ];
    matrixRows.push(rowData);
  });

  const wsMatrix = XLSX.utils.aoa_to_sheet(matrixRows);
  const colWidths: { wch: number }[] = [
    { wch: 6 },   // 연번
    { wch: 13 },  // 선생님 성함
    { wch: 12 },  // 담임 학급
    { wch: 12 },  // 주당 시수
  ];
  // 32 periods across Mon-Fri
  for (let i = 0; i < 32; i++) {
    colWidths.push({ wch: 9 });
  }
  wsMatrix['!cols'] = colWidths;
  XLSX.utils.book_append_sheet(wb, wsMatrix, '교사별_종합시간표');

  // ==========================================
  // Sheet 2: 전체_수업상세목록 (Flat List for filtering/pivot)
  // ==========================================
  const detailHeaders = ['연번', '선생님 성함', '담임 학급', '요일', '교시', '수업 학급(강의실)'];
  const detailRows: (string | number)[][] = [detailHeaders];
  let detailIdx = 1;

  sortedTeachers.forEach(t => {
    days.forEach(d => {
      const daySchedule = t.timetable?.[d.key] || {};
      for (let p = 1; p <= d.maxPeriod; p++) {
        const val = daySchedule[p];
        if (val && String(val).trim() !== '') {
          detailRows.push([
            detailIdx++,
            t.name,
            t.homeroom ? `${t.homeroom}반` : '',
            `${d.name}요일`,
            `${p}교시`,
            formatClassroomShort(String(val)),
          ]);
        }
      }
    });
  });

  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  wsDetail['!cols'] = [
    { wch: 8 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, '수업_상세목록');

  // Trigger download directly in browser
  const filename = customFilename.endsWith('.xlsx') ? customFilename : `${customFilename}.xlsx`;
  XLSX.writeFile(wb, filename);
}
