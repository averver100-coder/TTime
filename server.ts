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

app.post('/api/teachers', (req, res) => {
  try {
    const teachers = req.body;
    const filePath = path.join(process.cwd(), 'src', 'data', 'defaultTeachers.json');
    fs.writeFileSync(filePath, JSON.stringify(teachers, null, 2), 'utf-8');
    return res.json({ success: true });
  } catch (err) {
    console.error('Error saving teachers:', err);
    return res.status(500).json({ error: 'Failed to save teachers' });
  }
});

app.post('/api/parse-timetable', upload.single('file'), handleTimetableParse);
app.post('/api/parse-timetable-pdf', upload.single('file'), handleTimetableParse);

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
      server: { middlewareMode: true },
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
