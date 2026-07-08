const MASECHTOT = [
  { en: 'Berakhot', he: 'ברכות', last: 64, seder: 'זרעים' },
  { en: 'Shabbat', he: 'שבת', last: 157, seder: 'מועד' },
  { en: 'Eruvin', he: 'עירובין', last: 105, seder: 'מועד' },
  { en: 'Pesachim', he: 'פסחים', last: 121, seder: 'מועד' },
  { en: 'Rosh Hashanah', he: 'ראש השנה', last: 35, seder: 'מועד' },
  { en: 'Yoma', he: 'יומא', last: 88, seder: 'מועד' },
  { en: 'Sukkah', he: 'סוכה', last: 56, seder: 'מועד' },
  { en: 'Beitzah', he: 'ביצה', last: 40, seder: 'מועד' },
  { en: 'Taanit', he: 'תענית', last: 31, seder: 'מועד' },
  { en: 'Megillah', he: 'מגילה', last: 32, seder: 'מועד' },
  { en: 'Moed Katan', he: 'מועד קטן', last: 29, seder: 'מועד' },
  { en: 'Chagigah', he: 'חגיגה', last: 27, seder: 'מועד' },
  { en: 'Yevamot', he: 'יבמות', last: 122, seder: 'נשים' },
  { en: 'Ketubot', he: 'כתובות', last: 112, seder: 'נשים' },
  { en: 'Nedarim', he: 'נדרים', last: 91, seder: 'נשים' },
  { en: 'Nazir', he: 'נזיר', last: 66, seder: 'נשים' },
  { en: 'Sotah', he: 'סוטה', last: 49, seder: 'נשים' },
  { en: 'Gittin', he: 'גיטין', last: 90, seder: 'נשים' },
  { en: 'Kiddushin', he: 'קידושין', last: 82, seder: 'נשים' },
  { en: 'Bava Kamma', he: 'בבא קמא', last: 119, seder: 'נזיקין' },
  { en: 'Bava Metzia', he: 'בבא מציעא', last: 119, seder: 'נזיקין' },
  { en: 'Bava Batra', he: 'בבא בתרא', last: 176, seder: 'נזיקין' },
  { en: 'Sanhedrin', he: 'סנהדרין', last: 113, seder: 'נזיקין' },
  { en: 'Makkot', he: 'מכות', last: 24, seder: 'נזיקין' },
  { en: 'Shevuot', he: 'שבועות', last: 49, seder: 'נזיקין' },
  { en: 'Avodah Zarah', he: 'עבודה זרה', last: 76, seder: 'נזיקין' },
  { en: 'Horayot', he: 'הוריות', last: 14, seder: 'נזיקין' },
  { en: 'Zevachim', he: 'זבחים', last: 120, seder: 'קדשים' },
  { en: 'Menachot', he: 'מנחות', last: 110, seder: 'קדשים' },
  { en: 'Chullin', he: 'חולין', last: 142, seder: 'קדשים' },
  { en: 'Bekhorot', he: 'בכורות', last: 61, seder: 'קדשים' },
  { en: 'Arakhin', he: 'ערכין', last: 34, seder: 'קדשים' },
  { en: 'Temurah', he: 'תמורה', last: 34, seder: 'קדשים' },
  { en: 'Keritot', he: 'כריתות', last: 28, seder: 'קדשים' },
  { en: 'Meilah', he: 'מעילה', last: 22, seder: 'קדשים' },
  { en: 'Tamid', he: 'תמיד', last: 33, seder: 'קדשים' },
  { en: 'Niddah', he: 'נדה', last: 73, seder: 'טהרות' }
];

function gematria(n) {
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const hundreds = ['', 'ק', 'ר', 'ש', 'ת'];
  let out = '';
  let h = Math.floor(n / 100);
  let rest = n % 100;
  while (h > 4) { out += 'ת'; h -= 4; }
  out += hundreds[h] || '';
  if (rest === 15) out += 'טו';
  else if (rest === 16) out += 'טז';
  else {
    out += tens[Math.floor(rest / 10)];
    out += ones[rest % 10];
  }
  return out;
}

function amudLabel(daf) {
  const num = parseInt(daf, 10);
  const side = /b$/.test(daf) ? 'ב' : 'א';
  return { daf: gematria(num), amud: side, full: `דף ${gematria(num)} עמוד ${side}` };
}

function dapimFor(m) {
  const list = [];
  for (let d = 2; d <= m.last; d++) {
    list.push(d + 'a');
    list.push(d + 'b');
  }
  return list;
}
