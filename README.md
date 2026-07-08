# גמרא — Gmara

אפליקציית לימוד גמרא במסך מלא. הדף בצורתו המקורית (צורת הדף), תפריט קפיצה לכל מפרש על הדף,
ושיחת חברותא בוידאו.

A fullscreen Talmud learning app. The daf in its original layout (*tzuras hadaf*), a dropdown to
jump to any *mefaresh* on the page, and a chavrusa video call.

## מה יש בפנים

- **צורת הדף** — גמרא במרכז, רש״י ותוספות בצדדים, בבנייה חיה מטקסט Sefaria (הכל אינטראקטיבי, RTL).
- **מפרשים על הדף** — תפריט שנבנה אוטומטית לכל דף (מהרש״א, רא״ש, ר״ן, רשב״א, ריטב״א ועוד),
  ובחירת מפרש קופצת בדיוק למקום שעליו דיבר.
- **שיחת חברותא** — כפתור וידאו (Jitsi), חדר לפי הדף כך ששני הלומדים נפגשים "על הדף".

## Stack

- **Electron** — desktop app, fullscreen, Hebrew RTL.
- **Sefaria API** (free, no key) — text + all linked commentaries.
- **Jitsi** (free) — chavrusa video. Later: native WebRTC over the existing Cloudflare TURN +
  Firebase (`dawjam-126b1`) signaling.

## הרצה

```bash
npm install
npm start
```

- `F11` — מסך מלא · חצים `→ ←` — דף קודם/הבא · `Esc` — סגירת חלונית מפרש · `Ctrl+Q` — יציאה.

## Roadmap

- [ ] גופן רש״י אמיתי + עיטור צורת הדף (מסגרות, ריבוע האותיות).
- [ ] חשבונות משתמשים + נוכחות + הזמנת חברותא דרך Firebase.
- [ ] WebRTC מקומי (Cloudflare TURN) במקום Jitsi.
- [ ] סימניות, היסטוריית לימוד, חיפוש בתוך הש״ס.
