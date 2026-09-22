import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { parseExcelTimetable } from './server/excelParser.js';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

const handleTimetableParse = async (req: express.Request, res: express.Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const originalName = (req.file.originalname || '').toLowerCase();
    const isExcel = originalName.endsWith('.xlsx') || 
                    originalName.endsWith('.xls') || 
                    originalName.endsWith('.csv') ||
                    req.file.mimetype.includes('spreadsheet') || 
                    req.file.mimetype.includes('excel') || 
                    req.file.mimetype.includes('csv');

    if (isExcel) {
      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(req.file.buffer, {
          type: 'buffer',
          cellDates: true,
          codepage: 949
        });
      } catch {
        try {
          const textUtf8 = req.file.buffer.toString('utf-8');
          workbook = XLSX.read(textUtf8, { type: 'string' });
        } catch {
          workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        }
      }

      if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
        return res.status(400).json({ error: '엑셀 시트를 읽을 수 없습니다. 파일 형식을 확인해 주세요.' });
      }

      // 1. Try Gemini AI parsing FIRST for 100% accuracy across any school timetable format
      console.log('[Excel] Attempting Gemini AI smart timetable parsing...');
      if (process.env.GEMINI_API_KEY) {
        try {
          const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              }
            }
          });

          let combinedSheetsText = '';
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
            if (csv && csv.trim().length > 0) {
              combinedSheetsText += `=== Sheet: ${sheetName} ===\n${csv}\n\n`;
            }
          }

          if (combinedSheetsText.trim()) {
            const prompt = `
당신은 한국 고등학교의 교원 시간표 데이터를 정확하게 추출하는 전문 데이터 엔지니어입니다.
제공된 텍스트는 학교 시간표 엑셀/CSV 파일(.xlsx, .xls, .csv)의 모든 시트 데이터입니다.
모든 선생님의 성함(name), 담임 학급(homeroom, 예: "2-8", 없으면 ""), 그리고 요일별(Mon, Tue, Wed, Thu, Fri), 교시별(1~7) 수업 학급/교실 정보를 정확히 추출하여 유효한 JSON 배열로 반환하세요.

반환 형식 (반드시 유효한 JSON 배열만 출력):
[
  {
    "name": "선생님 성함",
    "homeroom": "담임 학급 (없으면 \"\")",
    "timetable": {
      "Mon": { "1": "1-1", "2": "1-2" },
      "Tue": { "3": "2-1" },
      "Wed": { "1": "2-2" },
      "Thu": { "2": "3-1" },
      "Fri": { "3": "3-2" }
    }
  }
]

규칙:
1. 요일 키는 반드시 영문 3글자: "Mon", "Tue", "Wed", "Thu", "Fri".
2. 교시 키는 문자열 숫자: "1", "2", "3", "4", "5", "6", "7".
3. 값(Value)은 해당 교시에 들어가는 학급 또는 강의실 번호 (예: "1-1", "208" 등).
4. 마크다운이나 기타 설명 없이 순수 JSON 배열만 출력하세요.

--- [엑셀 추출 데이터 원본] ---
${combinedSheetsText.slice(0, 100000)}
`;

            const aiRes = await ai.models.generateContent({
              model: 'gemini-3.6-flash',
              contents: [prompt],
              config: {
                responseMimeType: 'application/json',
              }
            });

            if (aiRes.text) {
              let jsonText = aiRes.text.trim();
              if (jsonText.startsWith('```json')) {
                jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
              } else if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
              }

              const firstBracket = jsonText.indexOf('[');
              const lastBracket = jsonText.lastIndexOf(']');
              if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
                jsonText = jsonText.substring(firstBracket, lastBracket + 1);
              }

              const aiTeachers = JSON.parse(jsonText);
              if (Array.isArray(aiTeachers) && aiTeachers.length > 0) {
                console.log(`[Excel] Successfully parsed ${aiTeachers.length} teachers via Gemini AI.`);
                try {
                  const defaultPath = path.join(process.cwd(), 'src', 'data', 'defaultTeachers.json');
                  const teachersWithIds = aiTeachers.map((t: any) => ({
                    id: t.name,
                    name: t.name,
                    homeroom: t.homeroom || '',
                    timetable: t.timetable || {}
                  }));
                  fs.writeFileSync(defaultPath, JSON.stringify(teachersWithIds, null, 2), 'utf-8');
                } catch (saveErr) {
                  console.warn('Failed to cache AI parsed teachers locally:', saveErr);
                }

                return res.json({ teachers: aiTeachers, format: 'excel', method: 'ai' });
              }
            }
          }
        } catch (aiErr) {
          console.warn('Gemini AI Excel parsing failed, falling back to deterministic parser:', aiErr);
        }
      }

      // 2. Fallback to deterministic parser
      const parsedTeachers = parseExcelTimetable(workbook);
      if (parsedTeachers.length > 0) {
        console.log(`[Excel] Successfully parsed ${parsedTeachers.length} teachers deterministically.`);
        
        try {
          const defaultPath = path.join(process.cwd(), 'src', 'data', 'defaultTeachers.json');
          const teachersWithIds = parsedTeachers.map(t => ({
            id: t.name,
            name: t.name,
            homeroom: t.homeroom || '',
            timetable: t.timetable
          }));
          fs.writeFileSync(defaultPath, JSON.stringify(teachersWithIds, null, 2), 'utf-8');
        } catch (saveErr) {
          console.warn('Failed to cache parsed teachers locally:', saveErr);
        }

        return res.json({
          teachers: parsedTeachers,
          format: 'excel',
          method: 'deterministic'
        });
      }

      return res.status(400).json({ 
        error: '엑셀 파일의 시간표 데이터를 추출할 수 없습니다. 컴시간 또는 나이스 표준 교원 시간표 양식의 파일을 업로드해 주세요.' 
      });

    } else {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(400).json({ error: 'GEMINI_API_KEY가 설정되어 있지 않습니다.' });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const base64Data = req.file.buffer.toString('base64');

      const prompt = `
당신은 한국 고등학교의 교원 시간표 데이터를 정확하게 추출하는 전문 데이터 파서입니다.
제공된 PDF 문서에는 선생님별 주간 수업시간표가 표 형태로 포함되어 있습니다.
문서의 모든 페이지(1페이지, 2페이지 등 전체)에 수록된 모든 선생님의 시간표를 빠짐없이 추출하여 JSON 배열 형태로 반환해 주세요.

반환 형식은 반드시 유효한 JSON 배열이어야 합니다:
[
  {
    "name": "선생님 성함 (예: 김정은)",
    "homeroom": "담임 학급 (예: 101, 1-9 등, 없거나 비어있으면 빈 문자열 \"\")",
    "timetable": {
      "Mon": { "1": "108", "2": "107" },
      "Tue": { "3": "110", "4": "107" },
      "Wed": { "1": "110" },
      "Thu": { "2": "207" },
      "Fri": { "3": "205" }
    }
  }
]

규칙:
1. 요일 키는 반드시 "Mon", "Tue", "Wed", "Thu", "Fri" 영문 3글자 약칭을 사용하세요.
2. 교시 키는 문자열 숫자 ("1", "2", "3", "4", "5", "6", "7")를 사용하세요.
3. 교실/학급 값은 셀에 적힌 학급(예: 101, 1-1, 203 등) 또는 특별실 이름을 그대로 넣으세요.
4. 빈 칸이거나 수업이 없는 공강 교시는 timetable에 포함하지 마세요.
5. 문서에 존재하는 모든 선생님(1번부터 마지막까지)을 단 한 명도 누락 없이 포함하세요.
6. JSON 이외의 설명이나 마크다운은 출력하지 마세요.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [
          prompt,
          {
            inlineData: {
              data: base64Data,
              mimeType: 'application/pdf',
            },
          },
        ],
        config: {
          responseMimeType: 'application/json',
          maxOutputTokens: 65536,
          temperature: 0.1,
        }
      });

      if (!response.text) {
        return res.status(500).json({ error: 'AI로부터 응답을 받지 못했습니다.' });
      }

      let jsonText = response.text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const firstBracket = jsonText.indexOf('[');
      const lastBracket = jsonText.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        jsonText = jsonText.substring(firstBracket, lastBracket + 1);
      }

      let teachers;
      try {
        teachers = JSON.parse(jsonText);
      } catch (parseErr) {
        // Attempt robust JSON repair for truncated output
        try {
          let fixed = jsonText.trim();
          const lastBrace = fixed.lastIndexOf('}');
          if (lastBrace !== -1) {
            fixed = fixed.substring(0, lastBrace + 1) + ']';
            teachers = JSON.parse(fixed);
          } else {
            throw parseErr;
          }
        } catch (repairErr) {
          console.error('Failed to parse AI JSON response:', jsonText.slice(0, 500), repairErr);
          return res.status(400).json({ error: 'PDF 파싱 중 JSON 구조를 올바르게 읽지 못했습니다. 다시 시도해 주세요.' });
        }
      }

      if (!Array.isArray(teachers) || teachers.length === 0) {
        return res.status(400).json({ error: '추출된 교원 시간표 데이터가 없습니다. PDF 문서 내용을 확인해 주세요.' });
      }

      // Save to defaultTeachers.json
      try {
        const defaultPath = path.join(process.cwd(), 'src', 'data', 'defaultTeachers.json');
        fs.writeFileSync(defaultPath, JSON.stringify(teachers, null, 2), 'utf-8');
      } catch (saveErr) {
        console.warn('Failed to cache PDF teachers locally:', saveErr);
      }

      return res.json({ teachers, format: 'pdf' });
    }
  } catch (error) {
    console.error('Error parsing timetable:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.' });
  }
};

// Helper to create timestamped backups
const BACKUP_DIR = path.join(process.cwd(), 'src', 'data', 'backups');
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function createTeacherBackup(teachers: any[], reason: string = 'manual') {
  try {
    if (!Array.isArray(teachers) || teachers.length === 0) return null;
    ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${timestamp}_${teachers.length}teachers_${reason}.json`;
    const filePath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(teachers, null, 2), 'utf-8');

    // Keep only the most recent 25 backups
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 25) {
      for (const oldFile of files.slice(25)) {
        try {
          fs.unlinkSync(path.join(BACKUP_DIR, oldFile.name));
        } catch {}
      }
    }
    return filename;
  } catch (err) {
    console.warn('[Backup] Failed to create teacher backup:', err);
    return null;
  }
}

// Initial safety backup of current 67 teachers on server load
try {
  const currentPath = path.join(process.cwd(), 'src', 'data', 'defaultTeachers.json');
  if (fs.existsSync(currentPath)) {
    const data = JSON.parse(fs.readFileSync(currentPath, 'utf-8'));
    if (Array.isArray(data) && data.length > 0) {
      createTeacherBackup(data, 'server_boot');
    }
  }
} catch {}

app.get('/api/teachers', (req, res) => {
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'defaultTeachers.json');
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return res.setHeader('Content-Type', 'application/json').send(data);
    }
    return res.json([]);
  } catch (err) {
    console.error('Error reading default teachers:', err);
    return res.status(500).json({ error: 'Failed to read teachers' });
  }
});

// Single teacher upsert (preserves all other teachers safely)
app.post('/api/teachers/single', (req, res) => {
  try {
    const { teacher } = req.body;
    if (!teacher || !teacher.name) {
      return res.status(400).json({ error: '유효한 선생님 정보가 필요합니다.' });
    }

    const filePath = path.join(process.cwd(), 'src', 'data', 'defaultTeachers.json');
    let currentTeachers: any[] = [];
    if (fs.existsSync(filePath)) {
      try {
        currentTeachers = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        currentTeachers = [];
      }
    }

    // Backup before modification
    if (currentTeachers.length > 0) {
      createTeacherBackup(currentTeachers, `before_edit_${encodeURIComponent(teacher.name).slice(0, 10)}`);
    }

    // Upsert teacher
    const idx = currentTeachers.findIndex(t => t.name === teacher.name);
    if (idx !== -1) {
      currentTeachers[idx] = teacher;
    } else {
      currentTeachers.push(teacher);
    }

    currentTeachers.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    fs.writeFileSync(filePath, JSON.stringify(currentTeachers, null, 2), 'utf-8');
    createTeacherBackup(currentTeachers, `after_edit_${encodeURIComponent(teacher.name).slice(0, 10)}`);

    return res.json({ success: true, teacherCount: currentTeachers.length, teacher });
  } catch (err) {
    console.error('Error upserting single teacher:', err);
    return res.status(500).json({ error: '선생님 데이터 저장에 실패했습니다.' });
  }
});

// Single teacher delete
app.delete('/api/teachers/:name', (req, res) => {
  try {
    const teacherName = decodeURIComponent(req.params.name);
    const filePath = path.join(process.cwd(), 'src', 'data', 'defaultTeachers.json');
    let currentTeachers: any[] = [];
    if (fs.existsSync(filePath)) {
      try {
        currentTeachers = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        currentTeachers = [];
      }
    }

    if (currentTeachers.length > 0) {
      createTeacherBackup(currentTeachers, `before_delete_${encodeURIComponent(teacherName).slice(0, 10)}`);
    }

    const filtered = currentTeachers.filter(t => t.name !== teacherName);
    fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2), 'utf-8');
    createTeacherBackup(filtered, `after_delete_${encodeURIComponent(teacherName).slice(0, 10)}`);

    return res.json({ success: true, teacherCount: filtered.length });
  } catch (err) {
    console.error('Error deleting single teacher:', err);
    return res.status(500).json({ error: '선생님 삭제에 실패했습니다.' });
  }
});

// Bulk teachers update (with mandatory safety backup)
app.post('/api/teachers', (req, res) => {
  try {
    const teachers = req.body;
    if (!Array.isArray(teachers)) {
      return res.status(400).json({ error: '선생님 목록 배열이 필요합니다.' });
    }

    const filePath = path.join(process.cwd(), 'src', 'data', 'defaultTeachers.json');
    if (fs.existsSync(filePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (Array.isArray(existing) && existing.length > 0) {
          createTeacherBackup(existing, `before_bulk_update`);
        }
      } catch {}
    }

    const sorted = [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2), 'utf-8');
    createTeacherBackup(sorted, `after_bulk_update`);

    return res.json({ success: true, teacherCount: sorted.length });
  } catch (err) {
    console.error('Error saving teachers:', err);
    return res.status(500).json({ error: 'Failed to save teachers' });
  }
});

// ==========================================
// Class Timetables APIs
// ==========================================
app.get('/api/classes', (req, res) => {
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'defaultClassTimetables.json');
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return res.setHeader('Content-Type', 'application/json').send(data);
    }
    return res.json([]);
  } catch (err) {
    console.error('Error reading default class timetables:', err);
    return res.status(500).json({ error: 'Failed to read class timetables' });
  }
});

app.post('/api/classes', (req, res) => {
  try {
    const classes = req.body;
    if (!Array.isArray(classes)) {
      return res.status(400).json({ error: '학급 목록 배열이 필요합니다.' });
    }

    const filePath = path.join(process.cwd(), 'src', 'data', 'defaultClassTimetables.json');
    if (fs.existsSync(filePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (Array.isArray(existing) && existing.length > 0) {
          ensureBackupDir();
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          fs.writeFileSync(
            path.join(BACKUP_DIR, `classes_backup_${timestamp}_${existing.length}classes.json`),
            JSON.stringify(existing, null, 2),
            'utf-8'
          );
        }
      } catch {}
    }

    const sorted = [...classes].sort((a, b) => 
      String(a.classCode).localeCompare(String(b.classCode), 'ko', { numeric: true })
    );
    fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2), 'utf-8');

    return res.json({ success: true, classCount: sorted.length });
  } catch (err) {
    console.error('Error saving class timetables:', err);
    return res.status(500).json({ error: 'Failed to save class timetables' });
  }
});

app.post('/api/classes/single', (req, res) => {
  try {
    const { classItem } = req.body;
    if (!classItem || !classItem.classCode) {
      return res.status(400).json({ error: '유효한 학급 정보가 필요합니다.' });
    }

    const filePath = path.join(process.cwd(), 'src', 'data', 'defaultClassTimetables.json');
    let currentClasses: any[] = [];
    if (fs.existsSync(filePath)) {
      try {
        currentClasses = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        currentClasses = [];
      }
    }

    const idx = currentClasses.findIndex(c => String(c.classCode) === String(classItem.classCode));
    if (idx !== -1) {
      currentClasses[idx] = classItem;
    } else {
      currentClasses.push(classItem);
    }

    currentClasses.sort((a, b) => 
      String(a.classCode).localeCompare(String(b.classCode), 'ko', { numeric: true })
    );
    fs.writeFileSync(filePath, JSON.stringify(currentClasses, null, 2), 'utf-8');

    return res.json({ success: true, classCount: currentClasses.length, classItem });
  } catch (err) {
    console.error('Error upserting single class:', err);
    return res.status(500).json({ error: '학급 시간표 저장에 실패했습니다.' });
  }
});

// Backup endpoints
app.get('/api/backups', (req, res) => {
  try {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .map(f => {
        const fullPath = path.join(BACKUP_DIR, f);
        const stat = fs.statSync(fullPath);
        let teacherCount = 0;
        try {
          const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
          teacherCount = Array.isArray(parsed) ? parsed.length : 0;
        } catch {}
        return {
          filename: f,
          createdAt: stat.mtime.toISOString(),
          size: stat.size,
          teacherCount,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json(files);
  } catch (err) {
    console.error('Error listing backups:', err);
    return res.status(500).json({ error: '백업 목록을 불러올 수 없습니다.' });
  }
});

app.post('/api/backups/create', (req, res) => {
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'defaultTeachers.json');
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '시간표 데이터가 없습니다.' });
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const filename = createTeacherBackup(data, 'manual_snapshot');
    return res.json({ success: true, filename, teacherCount: data.length });
  } catch (err) {
    console.error('Error creating manual backup:', err);
    return res.status(500).json({ error: '백업 생성에 실패했습니다.' });
  }
});

app.post('/api/backups/restore', (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: '복원할 백업 파일명이 필요합니다.' });
    }

    // Sanitize filename
    const safeName = path.basename(filename);
    const backupPath = path.join(BACKUP_DIR, safeName);
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: '해당 백업 파일을 찾을 수 없습니다.' });
    }

    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
    if (!Array.isArray(backupData)) {
      return res.status(400).json({ error: '올바른 백업 데이터 형식이 아닙니다.' });
    }

    // Save current before restoring
    const currentPath = path.join(process.cwd(), 'src', 'data', 'defaultTeachers.json');
    if (fs.existsSync(currentPath)) {
      try {
        const currentData = JSON.parse(fs.readFileSync(currentPath, 'utf-8'));
        createTeacherBackup(currentData, 'before_restore');
      } catch {}
    }

    const sorted = [...backupData].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    fs.writeFileSync(currentPath, JSON.stringify(sorted, null, 2), 'utf-8');
    createTeacherBackup(sorted, 'after_restore');

    return res.json({ success: true, teachers: sorted, teacherCount: sorted.length });
  } catch (err) {
    console.error('Error restoring backup:', err);
    return res.status(500).json({ error: '백업 복원에 실패했습니다.' });
  }
});

// ==========================================
// Gate Duty (교문지도) Endpoints & Handlers
// ==========================================
const GATE_DUTY_DIR = path.join(process.cwd(), 'src', 'data');

app.get('/api/gate-duties', (req, res) => {
  try {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const filePath = path.join(GATE_DUTY_DIR, `gateDuties_${month}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return res.setHeader('Content-Type', 'application/json').send(data);
    }
    // Fallback to default if 2026-09
    const defaultPath = path.join(GATE_DUTY_DIR, 'defaultGateDuties.json');
    if (fs.existsSync(defaultPath)) {
      const data = JSON.parse(fs.readFileSync(defaultPath, 'utf-8'));
      if (data.yearMonth === month || !month) {
        return res.json(data);
      }
    }
    const [y, m] = month.split('-').map(Number);
    return res.json({
      yearMonth: month,
      year: y || 2026,
      month: m || 9,
      title: `${y || 2026}년 ${m || 9}월 교문지도`,
      updatedAt: new Date().toISOString(),
      duties: []
    });
  } catch (err) {
    console.error('Error fetching gate duties:', err);
    return res.status(500).json({ error: '교문지도 데이터를 불러오지 못했습니다.' });
  }
});

app.post('/api/gate-duties', (req, res) => {
  try {
    const record = req.body;
    if (!record || !record.yearMonth || !Array.isArray(record.duties)) {
      return res.status(400).json({ error: '유효한 교문지도 데이터가 아닙니다.' });
    }
    record.updatedAt = new Date().toISOString();
    const filePath = path.join(GATE_DUTY_DIR, `gateDuties_${record.yearMonth}.json`);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');

    // Also update defaultGateDuties.json if it is 2026-09
    if (record.yearMonth === '2026-09') {
      const defaultPath = path.join(GATE_DUTY_DIR, 'defaultGateDuties.json');
      fs.writeFileSync(defaultPath, JSON.stringify(record, null, 2), 'utf-8');
    }

    return res.json({ success: true, count: record.duties.length });
  } catch (err) {
    console.error('Error saving gate duties:', err);
    return res.status(500).json({ error: '교문지도 데이터를 저장하지 못했습니다.' });
  }
});

const handleGateDutyParse = async (req: express.Request, res: express.Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '업로드할 파일이 없습니다.' });
    }

    const mime = (req.file.mimetype || '').toLowerCase();
    const originalName = (req.file.originalname || '').toLowerCase();
    const isPdf = mime.includes('pdf') || originalName.endsWith('.pdf');
    const isImage = mime.includes('image') || /\.(jpe?g|png|webp|gif)$/i.test(originalName);
    const isExcel = originalName.endsWith('.xlsx') || originalName.endsWith('.xls') || originalName.endsWith('.csv') || mime.includes('spreadsheet') || mime.includes('excel');

    // Default year/month from current date or query
    const targetYear = parseInt(req.body.year as string, 10) || 2026;
    const targetMonth = parseInt(req.body.month as string, 10) || 9;

    // 1. If Excel, try Gemini AI or local XLSX parsing
    if (isExcel) {
      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      } catch {
        workbook = XLSX.read(req.file.buffer.toString('utf-8'), { type: 'string' });
      }

      if (process.env.GEMINI_API_KEY) {
        try {
          const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
          });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });

          const prompt = `
당신은 한국 고등학교의 월별 "교문 지도(등교 지도) 교사 배정표" 데이터를 구조화하는 전문가입니다.
다음 CSV/엑셀 텍스트에서 각 날짜별 교문 지도 교사 명단을 추출하여 반드시 유효한 JSON 형식으로 출력하세요.
대상 연도: ${targetYear}년, 월: ${targetMonth}월 (텍스트 내 날짜 우선)

반환 형식:
{
  "year": ${targetYear},
  "month": ${targetMonth},
  "yearMonth": "${targetYear}-${String(targetMonth).padStart(2, '0')}",
  "title": "${targetYear}년 ${targetMonth}월 교문지도",
  "duties": [
    {
      "id": "2026-09-01",
      "date": "2026-09-01",
      "month": 9,
      "day": 1,
      "dayOfWeek": "화요일",
      "teachers": ["최지수", "조현민"],
      "note": ""
    }
  ]
}

규칙:
1. date는 "YYYY-MM-DD" 형태 (예: "2026-09-01")
2. dayOfWeek는 "월요일", "화요일", "수요일", "목요일", "금요일"
3. teachers는 교사 이름들의 배열 (예: ["김영석", "위혜선"])
4. 비고나 시험(중간고사, 기말고사 등)이 있으면 note에 기재, 없으면 ""
5. 마크다운이나 기타 설명 없이 순수 JSON만 반환하세요.

--- [데이터 원본] ---
${csv}
`;

          const aiRes = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: [prompt],
            config: { responseMimeType: 'application/json' }
          });

          if (aiRes.text) {
            let cleanJson = aiRes.text.trim();
            if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            else if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
            const parsed = JSON.parse(cleanJson);
            if (parsed && Array.isArray(parsed.duties)) {
              return res.json({ success: true, record: parsed });
            }
          }
        } catch (aiErr) {
          console.warn('[GateDuty] Gemini Excel parse fallback:', aiErr);
        }
      }
    }

    // 2. If PDF or Image, use Gemini Multimodal extraction
    if ((isPdf || isImage) && process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const prompt = `
이 문서는 한국 고등학교의 월별 "교문 지도(등교 지도) 교사 배정표"입니다.
표의 일자(요일), 지도교사, 비고 정보를 읽어서 정확한 JSON 형식으로 추출하세요.
기본 연도: ${targetYear}년, 월: ${targetMonth}월

반환 형식:
{
  "year": ${targetYear},
  "month": ${targetMonth},
  "yearMonth": "${targetYear}-${String(targetMonth).padStart(2, '0')}",
  "title": "${targetYear}년 ${targetMonth}월 교문지도",
  "duties": [
    {
      "id": "2026-09-01",
      "date": "2026-09-01",
      "month": 9,
      "day": 1,
      "dayOfWeek": "화요일",
      "teachers": ["최지수", "조현민"],
      "note": ""
    }
  ]
}

규칙:
1. 각 행의 일자(요일), 배정된 지도교사 성함(보통 2명), 비고(중간고사 등)를 빠짐없이 추출하세요.
2. date는 "YYYY-MM-DD" 형태입니다.
3. teachers는 이름 문자열의 배열입니다.
4. 순수 JSON만 출력하세요.
`;

        const base64Data = req.file.buffer.toString('base64');
        const filePart = {
          inlineData: {
            data: base64Data,
            mimeType: isPdf ? 'application/pdf' : (req.file.mimetype || 'image/png')
          }
        };

        const aiRes = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: [filePart, prompt],
          config: { responseMimeType: 'application/json' }
        });

        if (aiRes.text) {
          let cleanJson = aiRes.text.trim();
          if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          else if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
          const parsed = JSON.parse(cleanJson);
          if (parsed && Array.isArray(parsed.duties)) {
            return res.json({ success: true, record: parsed });
          }
        }
      } catch (err) {
        console.error('[GateDuty] Gemini PDF/Image parse error:', err);
      }
    }

    return res.status(400).json({ error: '교문지도 파일을 분석할 수 없습니다. 엑셀 파일 형식을 확인해주세요.' });
  } catch (err) {
    console.error('Error parsing gate duty:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : '파일 분석 중 오류가 발생했습니다.' });
  }
};

app.post('/api/parse-gate-duty', upload.single('file'), handleGateDutyParse);

// ==========================================
// Lunch Duty (급식감독) Endpoints & Handlers
// ==========================================
const LUNCH_DUTY_DIR = path.join(process.cwd(), 'src', 'data');

app.get('/api/lunch-duties', (req, res) => {
  try {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const filePath = path.join(LUNCH_DUTY_DIR, `lunchDuties_${month}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return res.setHeader('Content-Type', 'application/json').send(data);
    }
    // Fallback to default if 2026-09
    const defaultPath = path.join(LUNCH_DUTY_DIR, 'defaultLunchDuties.json');
    if (fs.existsSync(defaultPath)) {
      const data = JSON.parse(fs.readFileSync(defaultPath, 'utf-8'));
      if (data.yearMonth === month || !month) {
        return res.json(data);
      }
    }
    const [y, m] = month.split('-').map(Number);
    return res.json({
      yearMonth: month,
      year: y || 2026,
      month: m || 9,
      title: `${y || 2026}년 ${m || 9}월 급식감독`,
      updatedAt: new Date().toISOString(),
      duties: []
    });
  } catch (err) {
    console.error('Error fetching lunch duties:', err);
    return res.status(500).json({ error: '급식감독 데이터를 불러오지 못했습니다.' });
  }
});

app.post('/api/lunch-duties', (req, res) => {
  try {
    const record = req.body;
    if (!record || !record.yearMonth || !Array.isArray(record.duties)) {
      return res.status(400).json({ error: '유효한 급식감독 데이터가 아닙니다.' });
    }
    record.updatedAt = new Date().toISOString();
    const filePath = path.join(LUNCH_DUTY_DIR, `lunchDuties_${record.yearMonth}.json`);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');

    // Also update defaultLunchDuties.json if it is 2026-09
    if (record.yearMonth === '2026-09') {
      const defaultPath = path.join(LUNCH_DUTY_DIR, 'defaultLunchDuties.json');
      fs.writeFileSync(defaultPath, JSON.stringify(record, null, 2), 'utf-8');
    }

    return res.json({ success: true, count: record.duties.length });
  } catch (err) {
    console.error('Error saving lunch duties:', err);
    return res.status(500).json({ error: '급식감독 데이터를 저장하지 못했습니다.' });
  }
});

// ==========================================
// School Meals (식단표) Endpoints
// ==========================================
const MEAL_DIR = path.join(process.cwd(), 'src', 'data');

app.get('/api/meals', (req, res) => {
  try {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const filePath = path.join(MEAL_DIR, `meals_${month}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return res.setHeader('Content-Type', 'application/json').send(data);
    }
    // Fallback to default if 2026-09
    const defaultPath = path.join(MEAL_DIR, 'defaultMeals.json');
    if (fs.existsSync(defaultPath)) {
      const data = JSON.parse(fs.readFileSync(defaultPath, 'utf-8'));
      if (data.yearMonth === month || !month) {
        return res.json(data);
      }
    }
    const [y, m] = month.split('-').map(Number);
    return res.json({
      yearMonth: month,
      year: y || 2026,
      month: m || 9,
      title: `${y || 2026}년 ${m || 9}월 식단표`,
      updatedAt: new Date().toISOString(),
      meals: []
    });
  } catch (err) {
    console.error('Error fetching meals:', err);
    return res.status(500).json({ error: '식단 데이터를 불러오지 못했습니다.' });
  }
});

app.post('/api/meals', (req, res) => {
  try {
    const record = req.body;
    if (!record || !record.yearMonth || !Array.isArray(record.meals)) {
      return res.status(400).json({ error: '유효한 식단 데이터가 아닙니다.' });
    }
    record.updatedAt = new Date().toISOString();
    const filePath = path.join(MEAL_DIR, `meals_${record.yearMonth}.json`);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');

    // Also update defaultMeals.json if it is 2026-09
    if (record.yearMonth === '2026-09') {
      const defaultPath = path.join(MEAL_DIR, 'defaultMeals.json');
      fs.writeFileSync(defaultPath, JSON.stringify(record, null, 2), 'utf-8');
    }

    return res.json({ success: true, count: record.meals.length });
  } catch (err) {
    console.error('Error saving meals:', err);
    return res.status(500).json({ error: '식단 데이터를 저장하지 못했습니다.' });
  }
});

// ==========================================
// Schedule Change & Free Period Push Alerts
// ==========================================
const ALERTS_FILE = path.join(process.cwd(), 'src', 'data', 'scheduleAlerts.json');

app.get('/api/schedule-alerts', (req, res) => {
  try {
    if (fs.existsSync(ALERTS_FILE)) {
      const data = fs.readFileSync(ALERTS_FILE, 'utf-8');
      return res.setHeader('Content-Type', 'application/json').send(data);
    }
    return res.json([]);
  } catch (err) {
    console.error('Error fetching schedule alerts:', err);
    return res.status(500).json({ error: '알림 목록을 불러오지 못했습니다.' });
  }
});

app.post('/api/schedule-alerts', (req, res) => {
  try {
    const newAlert = req.body;
    if (!newAlert || !newAlert.id || !newAlert.title) {
      return res.status(400).json({ error: '유효한 알림 데이터가 아닙니다.' });
    }

    let alerts: any[] = [];
    if (fs.existsSync(ALERTS_FILE)) {
      try {
        alerts = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf-8'));
      } catch {}
    }

    alerts = [newAlert, ...alerts.filter((a: any) => a.id !== newAlert.id)].slice(0, 50);
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2), 'utf-8');

    return res.json({ success: true, alert: newAlert });
  } catch (err) {
    console.error('Error saving schedule alert:', err);
    return res.status(500).json({ error: '알림을 저장하지 못했습니다.' });
  }
});

const handleLunchDutyParse = async (req: express.Request, res: express.Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '업로드할 파일이 없습니다.' });
    }

    const mime = (req.file.mimetype || '').toLowerCase();
    const originalName = (req.file.originalname || '').toLowerCase();
    const isPdf = mime.includes('pdf') || originalName.endsWith('.pdf');
    const isImage = mime.includes('image') || /\.(jpe?g|png|webp|gif)$/i.test(originalName);
    const isExcel = originalName.endsWith('.xlsx') || originalName.endsWith('.xls') || originalName.endsWith('.csv') || mime.includes('spreadsheet') || mime.includes('excel');

    const targetYear = parseInt(req.body.year as string, 10) || 2026;
    const targetMonth = parseInt(req.body.month as string, 10) || 9;

    // 1. If Excel, try Gemini AI or XLSX parsing
    if (isExcel) {
      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      } catch {
        workbook = XLSX.read(req.file.buffer.toString('utf-8'), { type: 'string' });
      }

      if (process.env.GEMINI_API_KEY) {
        try {
          const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
          });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });

          const prompt = `
당신은 한국 고등학교의 월별 "급식 감독 교사 배정표" 데이터를 구조화하는 전문가입니다.
다음 CSV/엑셀 텍스트에서 각 날짜별 급식 감독 교사 명단(총괄지도, 3학년, 2학년, 1학년 등)을 추출하여 반드시 유효한 JSON 형식으로 출력하세요.
대상 연도: ${targetYear}년, 월: ${targetMonth}월 (텍스트 내 날짜 우선)

반환 형식:
{
  "year": ${targetYear},
  "month": ${targetMonth},
  "yearMonth": "${targetYear}-${String(targetMonth).padStart(2, '0')}",
  "title": "${targetYear}년 ${targetMonth}월 급식감독",
  "duties": [
    {
      "id": "2026-09-01",
      "date": "2026-09-01",
      "month": 9,
      "day": 1,
      "dayOfWeek": "화요일",
      "generalTeacher": "윤춘삼",
      "grade3Teacher": "조원경",
      "grade2Teacher": "임수경",
      "grade1Teacher": "위혜선",
      "teachers": ["윤춘삼", "조원경", "임수경", "위혜선"],
      "note": ""
    }
  ]
}

규칙:
1. date는 "YYYY-MM-DD" 형태 (예: "2026-09-01")
2. dayOfWeek는 "월요일", "화요일", "수요일", "목요일", "금요일"
3. 총괄지도, 3학년, 2학년, 1학년 배정 교사 성함을 각각 generalTeacher, grade3Teacher, grade2Teacher, grade1Teacher에 배정하세요.
4. teachers는 해당 날짜의 모든 교사 이름들의 배열입니다.
5. 비고나 특이사항이 있으면 note에 기재, 없으면 ""
6. 마크다운이나 기타 설명 없이 순수 JSON만 반환하세요.

--- [데이터 원본] ---
${csv}
`;

          const aiRes = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: [prompt],
            config: { responseMimeType: 'application/json' }
          });

          if (aiRes.text) {
            let cleanJson = aiRes.text.trim();
            if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            else if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
            const parsed = JSON.parse(cleanJson);
            if (parsed && Array.isArray(parsed.duties)) {
              return res.json({ success: true, record: parsed });
            }
          }
        } catch (aiErr) {
          console.warn('[LunchDuty] Gemini Excel parse fallback:', aiErr);
        }
      }
    }

    // 2. If PDF or Image, use Gemini Multimodal extraction
    if ((isPdf || isImage) && process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const prompt = `
이 문서는 한국 고등학교의 월별 "급식 감독 교사 배정표"입니다.
표의 일자(요일), 총괄지도, 3학년, 2학년, 1학년 배정 교사, 비고 정보를 읽어서 정확한 JSON 형식으로 추출하세요.
기본 연도: ${targetYear}년, 월: ${targetMonth}월

반환 형식:
{
  "year": ${targetYear},
  "month": ${targetMonth},
  "yearMonth": "${targetYear}-${String(targetMonth).padStart(2, '0')}",
  "title": "${targetYear}년 ${targetMonth}월 급식감독",
  "duties": [
    {
      "id": "2026-09-01",
      "date": "2026-09-01",
      "month": 9,
      "day": 1,
      "dayOfWeek": "화요일",
      "generalTeacher": "윤춘삼",
      "grade3Teacher": "조원경",
      "grade2Teacher": "임수경",
      "grade1Teacher": "위혜선",
      "teachers": ["윤춘삼", "조원경", "임수경", "위혜선"],
      "note": ""
    }
  ]
}

규칙:
1. 각 행의 일자(요일), 총괄지도, 3학년, 2학년, 1학년 교사 성함을 정확히 추출하세요.
2. date는 "YYYY-MM-DD" 형태입니다.
3. teachers는 교사 성함들의 배열입니다.
4. 순수 JSON만 출력하세요.
`;

        const base64Data = req.file.buffer.toString('base64');
        const filePart = {
          inlineData: {
            data: base64Data,
            mimeType: isPdf ? 'application/pdf' : (req.file.mimetype || 'image/png')
          }
        };

        const aiRes = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: [filePart, prompt],
          config: { responseMimeType: 'application/json' }
        });

        if (aiRes.text) {
          let cleanJson = aiRes.text.trim();
          if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          else if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
          const parsed = JSON.parse(cleanJson);
          if (parsed && Array.isArray(parsed.duties)) {
            return res.json({ success: true, record: parsed });
          }
        }
      } catch (err) {
        console.error('[LunchDuty] Gemini PDF/Image parse error:', err);
      }
    }

    return res.status(400).json({ error: '급식감독 파일을 분석할 수 없습니다. 엑셀 파일 형식을 확인해주세요.' });
  } catch (err) {
    console.error('Error parsing lunch duty:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : '파일 분석 중 오류가 발생했습니다.' });
  }
};

const handleMealParse = async (req: express.Request, res: express.Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '업로드할 파일이 없습니다.' });
    }

    const mime = (req.file.mimetype || '').toLowerCase();
    const originalName = (req.file.originalname || '').toLowerCase();
    const isPdf = mime.includes('pdf') || originalName.endsWith('.pdf');
    const isImage = mime.includes('image') || /\.(jpe?g|png|webp|gif)$/i.test(originalName);
    const isExcel = originalName.endsWith('.xlsx') || originalName.endsWith('.xls') || originalName.endsWith('.csv') || mime.includes('spreadsheet') || mime.includes('excel');

    const targetYear = parseInt(req.body.year as string, 10) || 2026;
    const targetMonth = parseInt(req.body.month as string, 10) || 9;

    // 1. If Excel, try Gemini AI extraction
    if (isExcel) {
      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      } catch {
        workbook = XLSX.read(req.file.buffer.toString('utf-8'), { type: 'string' });
      }

      if (process.env.GEMINI_API_KEY) {
        try {
          const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
          });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });

          const prompt = `
당신은 한국 학교의 "월별 학교 급식 식단표" 데이터를 구조화하는 전문가입니다.
다음 CSV 텍스트에서 각 일자별 급식 식단 메뉴(menuItems 배열), 요일, 칼로리(선택), 비고(중간고사, 주말, 휴업일 등)를 추출하여 유효한 JSON 형식으로 출력하세요.
대상 연도: ${targetYear}년, 월: ${targetMonth}월 (텍스트 내 연/월이 명시되어 있다면 해당 연/월 우선)

반환 형식:
{
  "year": ${targetYear},
  "month": ${targetMonth},
  "yearMonth": "${targetYear}-${String(targetMonth).padStart(2, '0')}",
  "title": "${targetYear}년 ${targetMonth}월 식단표",
  "meals": [
    {
      "id": "${targetYear}-${String(targetMonth).padStart(2, '0')}-01",
      "date": "${targetYear}-${String(targetMonth).padStart(2, '0')}-01",
      "month": ${targetMonth},
      "day": 1,
      "dayOfWeek": "화요일",
      "menuItems": ["발아현미밥", "아욱된장국", "고추장닭조림", "참나물 생채", "감자채볶음"],
      "calories": "685 kcal",
      "note": ""
    }
  ]
}

규칙:
1. date는 "YYYY-MM-DD" 형식 (예: "2026-09-01")
2. dayOfWeek는 "월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일" 중 하나
3. 메뉴 항목에서 알레르기 유발물질 번호(예: (5.6), 1.2.3 등)는 제거하고 순수한 요리명만 menuItems 배열에 넣으세요.
4. 중간고사, 기말고사, 재량휴업일, 개학식, 주말 등 특이사항이 있으면 note에 기재하세요.
5. 마크다운이나 기타 설명 없이 순수 JSON만 반환하세요.

--- [데이터 원본] ---
${csv}
`;

          const aiRes = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: [prompt],
            config: { responseMimeType: 'application/json' }
          });

          if (aiRes.text) {
            let cleanJson = aiRes.text.trim();
            if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            else if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
            const parsed = JSON.parse(cleanJson);
            if (parsed && Array.isArray(parsed.meals) && parsed.meals.length > 0) {
              return res.json({ success: true, record: parsed });
            }
          }
        } catch (aiErr) {
          console.warn('[Meal] Gemini Excel parse fallback:', aiErr);
        }
      }
    }

    // 2. If PDF or Image
    if ((isPdf || isImage) && process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const prompt = `
이 문서는 한국 학교의 "월간 학교 급식 식단표"입니다.
표의 일자(일), 요일, 제공되는 요리명/메뉴 목록, 칼로리, 특이사항(시험, 휴업일 등)을 읽어서 정확한 JSON 형식으로 추출하세요.
기본 연도: ${targetYear}년, 월: ${targetMonth}월

반환 형식:
{
  "year": ${targetYear},
  "month": ${targetMonth},
  "yearMonth": "${targetYear}-${String(targetMonth).padStart(2, '0')}",
  "title": "${targetYear}년 ${targetMonth}월 식단표",
  "meals": [
    {
      "id": "${targetYear}-${String(targetMonth).padStart(2, '0')}-01",
      "date": "${targetYear}-${String(targetMonth).padStart(2, '0')}-01",
      "month": ${targetMonth},
      "day": 1,
      "dayOfWeek": "화요일",
      "menuItems": ["발아현미밥", "아욱된장국", "고추장닭조림", "참나물 생채", "감자채볶음"],
      "calories": "685 kcal",
      "note": ""
    }
  ]
}

알레르기 번호는 메뉴명에서 제외하고 순수 음식명만 남겨주세요.
순수 JSON만 출력하세요.
`;

        const base64Data = req.file.buffer.toString('base64');
        const filePart = {
          inlineData: {
            data: base64Data,
            mimeType: isPdf ? 'application/pdf' : (req.file.mimetype || 'image/png')
          }
        };

        const aiRes = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: [filePart, prompt],
          config: { responseMimeType: 'application/json' }
        });

        if (aiRes.text) {
          let cleanJson = aiRes.text.trim();
          if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          else if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
          const parsed = JSON.parse(cleanJson);
          if (parsed && Array.isArray(parsed.meals) && parsed.meals.length > 0) {
            return res.json({ success: true, record: parsed });
          }
        }
      } catch (err) {
        console.error('[Meal] Gemini PDF/Image parse error:', err);
      }
    }

    return res.status(400).json({ error: '식단 파일을 분석할 수 없습니다. 엑셀 파일 형식을 확인해주세요.' });
  } catch (err) {
    console.error('Error parsing meal file:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : '파일 분석 중 오류가 발생했습니다.' });
  }
};

app.post('/api/parse-meal', upload.single('file'), handleMealParse);
app.post('/api/parse-lunch-duty', upload.single('file'), handleLunchDutyParse);

app.post('/api/parse-timetable', upload.single('file'), handleTimetableParse);
app.post('/api/parse-timetable-pdf', upload.single('file'), handleTimetableParse);

app.get('/sw.js', (req, res, next) => {
  const distSw = path.join(process.cwd(), 'dist', 'sw.js');
  const pubSw = path.join(process.cwd(), 'public', 'sw.js');
  const swPath = fs.existsSync(distSw) ? distSw : (fs.existsSync(pubSw) ? pubSw : null);
  if (swPath) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    return res.sendFile(swPath);
  }
  // Safe JS fallback in dev mode when service worker bundle is not yet generated
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  return res.send('// Dev mode placeholder service worker\nself.addEventListener("install", () => self.skipWaiting());\n');
});

app.get(/^\/workbox-[a-zA-Z0-9]+\.js$/, (req, res, next) => {
  const fileName = path.basename(req.path);
  const distFile = path.join(process.cwd(), 'dist', fileName);
  if (fs.existsSync(distFile)) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    return res.sendFile(distFile);
  }
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  return res.send('// Dev mode placeholder\n');
});

app.get('/manifest.webmanifest', (req, res, next) => {
  const p = path.join(process.cwd(), 'public', 'manifest.webmanifest');
  if (fs.existsSync(p)) {
    res.setHeader('Content-Type', 'application/manifest+json');
    return res.sendFile(p);
  }
  next();
});

app.get('/manifest.json', (req, res, next) => {
  const p = path.join(process.cwd(), 'public', 'manifest.json');
  if (fs.existsSync(p)) {
    res.setHeader('Content-Type', 'application/manifest+json');
    return res.sendFile(p);
  }
  next();
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
