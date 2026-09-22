import React, { useState } from 'react';
import { Star, GraduationCap, User, X, Sparkles, Trash2 } from 'lucide-react';
import { BookmarkItem } from '../hooks/useBookmarks';

interface BookmarkSectionProps {
  bookmarks: BookmarkItem[];
  onSelectTeacher: (teacherName: string) => void;
  onSelectClass: (classCode: string) => void;
  onRemoveBookmark: (type: 'teacher' | 'class', id: string) => void;
  onClearAll?: () => void;
}

export const BookmarkSection: React.FC<BookmarkSectionProps> = ({
  bookmarks,
  onSelectTeacher,
  onSelectClass,
  onRemoveBookmark,
  onClearAll,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'teacher' | 'class'>('ALL');

  if (bookmarks.length === 0) {
    return (
      <div className="bg-gradient-to-r from-amber-50/70 via-yellow-50/50 to-orange-50/60 rounded-2xl p-3.5 sm:p-4 border border-amber-200/70 mb-6 flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs">
          <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
        </div>
        <div className="text-xs text-amber-900 leading-relaxed">
          <span className="font-bold">나만의 즐겨찾는 시간표 기능:</span> 자주 확인하는{' '}
          <span className="font-semibold text-amber-950">선생님</span>이나{' '}
          <span className="font-semibold text-amber-950">학급 시간표</span>에서{' '}
          <span className="inline-flex items-center gap-0.5 font-bold text-amber-800 bg-amber-200/60 px-1.5 py-0.5 rounded">
            <Star className="w-3 h-3 fill-amber-500 text-amber-600 inline" /> 즐겨찾기
          </span>{' '}
          버튼을 누르면 여기에 저장되어 브라우저를 새로고침해도 언제든 바로 볼 수 있습니다.
        </div>
      </div>
    );
  }

  const filteredBookmarks = bookmarks.filter(b => {
    if (filter === 'ALL') return true;
    return b.type === filter;
  });

  const teacherCount = bookmarks.filter(b => b.type === 'teacher').length;
  const classCount = bookmarks.filter(b => b.type === 'class').length;

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-5 border border-amber-200 shadow-sm shadow-amber-500/5 mb-6 relative overflow-hidden">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-2xs">
            <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-gray-900 tracking-tight">
                즐겨찾는 시간표
              </h3>
              <span className="bg-amber-100 text-amber-800 text-[11px] font-extrabold px-2 py-0.5 rounded-full border border-amber-200">
                {bookmarks.length}개
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              클릭 시 해당 시간표로 즉시 이동합니다 (로컬 저장 유지)
            </p>
          </div>
        </div>

        {/* Filter Chips & Clear Option */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
          {teacherCount > 0 && classCount > 0 && (
            <div className="flex items-center bg-gray-100 p-0.5 rounded-lg text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setFilter('ALL')}
                className={`px-2 py-1 rounded-md transition cursor-pointer ${
                  filter === 'ALL'
                    ? 'bg-white text-gray-900 shadow-2xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                전체 ({bookmarks.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('teacher')}
                className={`px-2 py-1 rounded-md transition cursor-pointer ${
                  filter === 'teacher'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                선생님 ({teacherCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('class')}
                className={`px-2 py-1 rounded-md transition cursor-pointer ${
                  filter === 'class'
                    ? 'bg-white text-indigo-600 shadow-2xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                학급 ({classCount})
              </button>
            </div>
          )}

          {onClearAll && bookmarks.length > 2 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('저장된 즐겨찾기를 모두 삭제하시겠습니까?')) {
                  onClearAll();
                }
              }}
              className="text-[11px] text-gray-400 hover:text-red-500 px-2 py-1 rounded transition flex items-center gap-1 cursor-pointer"
              title="즐겨찾기 전체 삭제"
            >
              <Trash2 className="w-3 h-3" />
              <span>전체 삭제</span>
            </button>
          )}
        </div>
      </div>

      {/* Bookmarked Items Grid */}
      <div className="pt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {filteredBookmarks.map((item) => {
          const isTeacher = item.type === 'teacher';
          return (
            <div
              key={`${item.type}-${item.id}`}
              onClick={() => {
                if (isTeacher) {
                  onSelectTeacher(item.id);
                } else {
                  onSelectClass(item.id);
                }
              }}
              className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-2.5 cursor-pointer group hover:shadow-md ${
                isTeacher
                  ? 'bg-blue-50/40 hover:bg-blue-50/80 border-blue-100 hover:border-blue-300'
                  : 'bg-indigo-50/40 hover:bg-indigo-50/80 border-indigo-100 hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs font-bold text-xs ${
                    isTeacher
                      ? 'bg-blue-600 text-white group-hover:scale-105 transition-transform'
                      : 'bg-indigo-600 text-white group-hover:scale-105 transition-transform'
                  }`}
                >
                  {isTeacher ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <GraduationCap className="w-4 h-4" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-gray-900 group-hover:text-blue-700 transition truncate">
                      {item.title}
                    </span>
                    {isTeacher && (
                      <span className="text-[11px] text-gray-500 font-normal">선생님</span>
                    )}
                  </div>
                  {item.subtitle && (
                    <div className="text-[11px] font-semibold text-blue-600 truncate mt-0.5">
                      {item.subtitle}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveBookmark(item.type, item.id);
                  }}
                  className="p-1.5 rounded-lg text-amber-500 hover:text-red-500 hover:bg-white/80 transition cursor-pointer"
                  title="즐겨찾기 해제"
                >
                  <Star className="w-4 h-4 fill-amber-400 text-amber-500 group-hover:scale-110 transition-transform" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
