/**
 * Firestore CRUD Sample & Reference Implementation
 * 
 * Demonstrates standard, optimized Firestore Read/Write operations
 * for Timetables, Duties, and Meals in accordance with the proposed architecture.
 */

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  writeBatch,
  onSnapshot,
  getDocFromServer
} from 'firebase/firestore';
import { db } from './firebase';

// ============================================================================
// 1. [선생님 시간표] 단일 문서 정밀 쓰기 (Surgical Write) & 읽기
// ============================================================================

export interface SampleTeacherData {
  id: string;            // '김교사'
  name: string;          // '김교사'
  homeroom: string;      // '1-1'
  timetable: {
    Mon: { [period: string]: string };
    Tue: { [period: string]: string };
    Wed: { [period: string]: string };
    Thu: { [period: string]: string };
    Fri: { [period: string]: string };
  };
  updatedAt?: number;
}

/**
 * 교사 1명의 시간표 저장 (다른 교사의 데이터에 전혀 영향을 주지 않는 안전한 저장)
 */
export async function writeTeacherData(teacher: SampleTeacherData): Promise<void> {
  const teacherDocRef = doc(db, 'teachers', teacher.name);
  await setDoc(teacherDocRef, {
    name: teacher.name,
    homeroom: teacher.homeroom,
    timetable: JSON.stringify(teacher.timetable), // 또는 중첩 맵 객체로 저장 가능
    updatedAt: Date.now()
  }, { merge: true }); // merge: true로 기존 필드 보존
}

/**
 * 교사 1명의 시간표 읽기
 */
export async function readSingleTeacher(teacherName: string): Promise<SampleTeacherData | null> {
  const teacherDocRef = doc(db, 'teachers', teacherName);
  const snap = await getDoc(teacherDocRef);
  if (!snap.exists()) return null;

  const data = snap.data();
  return {
    id: teacherName,
    name: data.name || teacherName,
    homeroom: data.homeroom || '',
    timetable: typeof data.timetable === 'string' ? JSON.parse(data.timetable) : data.timetable,
    updatedAt: data.updatedAt
  };
}

/**
 * 전교사 시간표 일괄 읽기
 */
export async function readAllTeachers(): Promise<SampleTeacherData[]> {
  const snap = await getDocs(collection(db, 'teachers'));
  const teachers: SampleTeacherData[] = [];
  
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    teachers.push({
      id: docSnap.id,
      name: data.name || docSnap.id,
      homeroom: data.homeroom || '',
      timetable: typeof data.timetable === 'string' ? JSON.parse(data.timetable) : data.timetable,
      updatedAt: data.updatedAt
    });
  });

  return teachers.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

// ============================================================================
// 2. [식단표 / 교문·급식지도] 월(Month) 단위 번들링 쓰기 & 읽기 (비용 최적화)
// ============================================================================

export interface SampleMealMonth {
  yearMonth: string; // '2026-10'
  meals: Array<{
    date: string;     // '2026-10-23'
    menu: string;     // '현미밥, 된장찌개...'
    calories: string; // '650 kcal'
    allergies: string[];
  }>;
  updatedAt: number;
}

/**
 * 한 달 치 식단표 저장 (문서 1개로 저장하여 30일치 데이터를 단 1번의 Write로 완료)
 */
export async function writeMonthMeals(mealData: SampleMealMonth): Promise<void> {
  const mealDocRef = doc(db, 'meals', mealData.yearMonth);
  await setDoc(mealDocRef, {
    yearMonth: mealData.yearMonth,
    meals: mealData.meals,
    updatedAt: Date.now()
  }, { merge: true });
}

/**
 * 한 달 치 식단표 읽기 (1번의 Read 과금으로 1달치 전체 로딩)
 */
export async function readMonthMeals(yearMonth: string, forceServer: boolean = false): Promise<SampleMealMonth | null> {
  const mealDocRef = doc(db, 'meals', yearMonth);
  
  // forceServer: 브라우저 캐시를 무시하고 Firestore 서버 최신 데이터를 강제 조회할 때 사용
  const snap = forceServer 
    ? await getDocFromServer(mealDocRef)
    : await getDoc(mealDocRef);

  if (!snap.exists()) return null;
  return snap.data() as SampleMealMonth;
}

// ============================================================================
// 3. [배치 쓰기] 엑셀 대량 업로드 시 원자적 트랜잭션 (Atomic Batch Write)
// ============================================================================

/**
 * 엑셀로 업로드된 수십 명의 교사 데이터를 한 번에 원자적으로 저장 (최대 500개 지원)
 */
export async function batchSaveTeachers(teachers: SampleTeacherData[]): Promise<void> {
  const batch = writeBatch(db);

  for (const teacher of teachers) {
    const docRef = doc(db, 'teachers', teacher.name);
    batch.set(docRef, {
      name: teacher.name,
      homeroom: teacher.homeroom,
      timetable: JSON.stringify(teacher.timetable),
      updatedAt: Date.now()
    }, { merge: true });
  }

  // 네트워크 1회 왕복으로 원자적(All-or-Nothing) 일괄 커밋
  await batch.commit();
}

// ============================================================================
// 4. [실시간 구독] 교문/급식 지도 변경 즉시 화면 갱신 (onSnapshot)
// ============================================================================

/**
 * 특정 월의 급식지도 배정표를 실시간 구독 (누군가 수정하면 즉시 자동 감지)
 */
export function subscribeToLunchDuty(
  yearMonth: string, 
  callback: (data: any) => void
): () => void {
  const dutyDocRef = doc(db, 'lunchDuties', yearMonth);
  
  // unsubscribe 함수 반환 (컴포넌트 unmount 시 정리 가능)
  return onSnapshot(dutyDocRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data());
    } else {
      callback(null);
    }
  }, (error) => {
    console.error('실시간 급식지도 구독 에러:', error);
  });
}
