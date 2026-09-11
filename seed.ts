import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

const seedData = [
  {
    name: '김정은', homeroom: '',
    timetable: {
      Mon: { 1: '108', 2: '107', 4: '109', 6: '108', 7: '106' },
      Tue: { 3: '110', 4: '107' },
      Wed: { 1: '110', 4: '106', 5: '109', 6: '109' },
      Thu: { 3: '110', 5: '107' },
      Fri: { 1: '106', 3: '108' }
    }
  },
  {
    name: '김수민', homeroom: '',
    timetable: {
      Mon: { 3: '203', 5: '204', 6: '205' },
      Tue: { 1: '204', 3: '203', 4: '205' },
      Wed: { 2: '207', 5: '206', 6: '203' },
      Thu: { 2: '207', 5: '204', 6: '206' },
      Fri: { 3: '205', 4: '206', 6: '207' }
    }
  },
  {
    name: '정은채', homeroom: '',
    timetable: {
      Mon: { 2: '202', 3: '103', 5: '201' },
      Tue: { 1: '209', 2: '202', 4: '201' },
      Wed: { 1: '208', 2: '209', 5: '209' },
      Thu: { 1: '208', 4: '101' },
      Fri: { 1: '201', 2: '102', 5: '208', 6: '202' }
    }
  },
  {
    name: '최민진', homeroom: '',
    timetable: {
      Mon: { 1: '104', 3: '101', 4: '103' },
      Tue: { 1: '101', 3: '104', 4: '103' },
      Wed: { 1: '102', 3: '105', 4: '104' },
      Thu: { 1: '101', 4: '102', 5: '105' },
      Fri: { 2: '103', 5: '102', 6: '105' }
    }
  },
  {
    name: '최지수', homeroom: '',
    timetable: {
      Mon: { 2: '103', 5: '110' },
      Tue: { 1: '107', 2: '110', 4: '104', 6: '107' },
      Wed: { 2: '103' },
      Thu: { 1: '108', 2: '110', 3: '108', 4: '104', 5: '103' },
      Fri: { 2: '108', 3: '104', 5: '107' }
    }
  },
  {
    name: '김영은', homeroom: '109',
    timetable: {
      Mon: { 3: '106', 4: '101' },
      Tue: { 1: '102', 2: '109', 3: '109' },
      Wed: { 1: '106', 2: '101' },
      Thu: { 1: '101', 2: '105', 4: '102' },
      Fri: { 1: '106', 2: '105', 3: '109', 5: '102', 6: '105' }
    }
  },
  {
    name: '양지희', homeroom: '',
    timetable: {
      Mon: { 1: '205', 4: '201', 5: '202' },
      Tue: { 2: '204' },
      Wed: { 1: '202', 3: '201' },
      Thu: { 1: '204', 2: '201' },
      Fri: { 1: '205', 2: '204', 3: '202', 6: '205' }
    }
  },
  {
    name: '박주영', homeroom: '',
    timetable: {
      Mon: { 4: '209', 5: '203' },
      Tue: { 2: '207' },
      Wed: { 4: '209' },
      Thu: { 1: '207', 2: '208', 5: '209' },
      Fri: { 2: '208', 4: '203', 5: '207', 6: '208' }
    }
  },
  {
    name: '이정화', homeroom: '',
    timetable: {
      Mon: { 1: '108', 2: '109', 4: '206' },
      Tue: { 1: '206', 2: '206', 4: '107' },
      Wed: {}, Thu: {}, Fri: {}
    }
  },
  {
    name: '정원혁', homeroom: '',
    timetable: {
      Mon: { 1: '201', 5: '205' },
      Tue: { 1: '106', 2: '201', 4: '105' },
      Wed: { 2: '202', 4: '201' },
      Thu: { 1: '205', 2: '204' },
      Fri: { 1: '202', 2: '204', 5: '205' }
    }
  },
  {
    name: '김희수', homeroom: '',
    timetable: {
      Mon: { 2: '106', 5: '104', 7: '107' },
      Tue: { 1: '105', 2: '107', 4: '106', 5: '103' },
      Wed: { 4: '107' },
      Thu: { 1: '104', 2: '104', 3: '103' },
      Fri: { 2: '105', 3: '106', 5: '105', 6: '103' }
    }
  },
  {
    name: '장미경', homeroom: '101',
    timetable: {
      Mon: { 1: '101', 2: '102', 5: '108', 6: '109', 7: '108' },
      Tue: { 1: '102', 2: '109', 3: '108', 5: '110' },
      Wed: { 1: '101', 2: '110', 3: '109' },
      Thu: { 1: '101', 2: '102', 6: '110' },
      Fri: {}
    }
  },
  {
    name: '최경대', homeroom: '',
    timetable: {
      Mon: { 1: '203', 4: '209', 5: '207', 7: '206' },
      Tue: { 1: '209', 2: '203', 4: '208', 5: '206' },
      Wed: { 4: '207', 5: '209', 6: '206' },
      Thu: { 1: '203', 2: '208' },
      Fri: { 1: '104', 2: '207', 5: '208' }
    }
  },
  {
    name: '이규현', homeroom: '',
    timetable: {
      Mon: { 1: '102', 2: '101', 5: '109', 7: '103' },
      Tue: { 1: '103', 4: '102', 5: '104' },
      Wed: { 3: '104', 4: '103', 6: '109' },
      Thu: { 1: '102', 2: '101', 4: '109' },
      Fri: { 2: '101', 4: '104' }
    }
  },
  {
    name: '조원경', homeroom: '105',
    timetable: {
      Mon: { 1: '105', 4: '106', 5: '108', 7: '110' },
      Tue: { 1: '110', 4: '107', 6: '106' },
      Wed: { 1: '108', 2: '107' },
      Thu: { 2: '105', 4: '108', 5: '107' },
      Fri: { 2: '105', 4: '106' }
    }
  }
];

async function run() {
  console.log('Seeding data...');
  for (const teacher of seedData) {
    const ref = doc(db, 'teachers', teacher.name);
    await setDoc(ref, {
      name: teacher.name,
      homeroom: teacher.homeroom,
      timetable: JSON.stringify(teacher.timetable),
      updatedAt: Date.now()
    });
    console.log('Saved', teacher.name);
  }
  console.log('Seed complete.');
  process.exit(0);
}

run();
