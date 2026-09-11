export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri';

export interface Period {
  period: number;
  start: string; // HH:mm
  end: string;   // HH:mm
}

export const periods: Period[] = [
  { period: 1, start: '08:30', end: '09:20' },
  { period: 2, start: '09:30', end: '10:20' },
  { period: 3, start: '10:30', end: '11:20' },
  { period: 4, start: '11:30', end: '12:20' },
  { period: 5, start: '13:20', end: '14:10' },
  { period: 6, start: '14:20', end: '15:10' },
  { period: 7, start: '15:20', end: '16:10' },
];

export const dayNames: Record<DayOfWeek, string> = {
  Mon: '월요일',
  Tue: '화요일',
  Wed: '수요일',
  Thu: '목요일',
  Fri: '금요일',
};

// Map day index (0=Sun, 1=Mon, ..., 6=Sat) to DayOfWeek
export const getDayFromIndex = (index: number): DayOfWeek | null => {
  switch (index) {
    case 1: return 'Mon';
    case 2: return 'Tue';
    case 3: return 'Wed';
    case 4: return 'Thu';
    case 5: return 'Fri';
    default: return null; // Weekend
  }
};

export const getCurrentTimeMinutes = (date: Date = new Date()): number => {
  return date.getHours() * 60 + date.getMinutes();
};

export const parseTimeString = (timeStr: string): number => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

export interface TeacherTimetable {
  [day: string]: {
    [period: number]: string; // classroom e.g. "101" -> "1학년 1반"
  };
}

export interface Teacher {
  id: string;
  name: string;
  homeroom: string; // e.g. "101"
  timetable: TeacherTimetable;
}

export const formatClassroom = (classroomCode: string) => {
  if (!classroomCode || classroomCode.trim() === '') return '';
  if (/^\d{3}$/.test(classroomCode)) {
    const grade = classroomCode.charAt(0);
    const classNum = parseInt(classroomCode.substring(1), 10);
    return `${grade}학년 ${classNum}반`;
  }
  return classroomCode;
};
