# SPEC — "Find the Object" (Cultural Day, AOU · 1 Dec 2026)

A hidden-object game for a university cultural-day booth. Players tap objects hidden in an illustrated scene. **Each player gets ONE random stage** (out of 4). Runs on iPad (Safari, landscape) and a laptop (Chrome). Booth has internet, but the game must work fully offline once loaded. No prizes, no login.

UI language: **Arabic (RTL)**. This spec is in English; all player-facing strings are given in Arabic below.

---

## 1. Tech stack

- Plain **HTML + CSS + vanilla JS**, no framework, no build step. Must open from a static server or GitHub Pages.
- One page app: `index.html`, `style.css`, `game.js`.
- Stage data in `data/stages.json`. Scene images in `img/`.
- Separate tool: `editor.html` (hitbox editor, see §6). Not linked from the game.
- Font: Tajawal or Cairo (bundle locally, don't rely on Google Fonts at runtime).

```
/index.html
/style.css
/game.js
/editor.html
/editor.js
/data/stages.json
/img/levant.webp
/img/south-asia.webp
/img/africa-turkey-uganda.webp
/img/saudi-yemen.webp
/img/icons/<stageId>/<objectId>.webp   ← cropped by the editor
/sfx/found.mp3  /sfx/wrong.mp3  /sfx/win.mp3
```

---

## 2. Stages

| id | Arabic title | Scene |
|---|---|---|
| `levant` | بلاد الشام | Old Damascene house courtyard: fountain, jasmine, iwan, colored stone floor |
| `south-asia` | باكستان والهند وبنجلادش وأفغانستان | Busy colorful bazaar street with a decorated truck, rickshaws, stalls |
| `africa-turkey-uganda` | الدول العربية في أفريقيا وتركيا وأوغندا | Big harbor bazaar with side-by-side stalls: Maghreb, Egypt/Sudan, Horn of Africa, Turkish tea corner, Ugandan stall |
| `saudi-yemen` | السعودية واليمن | Heritage majlis with Hijazi rawashin, a Yemeni qamariya window, cushions and carpets |

**Stage selection:** random, but never the same stage twice in a row (remember the last stage in a variable; if the random pick equals it, pick again).

---

## 3. Round rules

- Each stage has a pool of 10–12 objects. Each round picks **6 at random** from the pool.
- Timer: **60 seconds**, shown as a bar + seconds at the top.
- **Hints: 3 per round.** Hint button = magnifier with a counter.
- Bottom bar shows **4 slots** at a time with the object's **cropped image** (from the scene) + its Arabic name under it. When an object is found, its slot animates out and the next object from the round queue fills it. When the queue is empty, slots simply empty out.
- A thin progress bar above the slots: found / 6.
- Round ends when all 6 are found (win) or time runs out.

### Tapping
- Hit test against the object's rectangle **expanded by 2% of the image width on each side** (finger tolerance).
- Only objects currently in the round count (even if they're not in the 4 visible slots — any of the 6 can be found).
- **Found:** draw a green circle + checkmark over the object, dim it slightly (it can't disappear — the image is flat), play `found.mp3`, show the fact card (§4) for 2.5 s as a toast at the top, it does NOT pause the timer.
- **Wrong tap:** small red ✕ at the tap point that fades in 400 ms, play `wrong.mp3` quietly.
- **Anti-spam:** 3 wrong taps within 1.5 s → screen shakes, taps are ignored for 1 s, show "على مهلك 🙂".

### Hint
- Pick a random unfound object from the round. Animate a sparkle trail from the hint button to the object's center (~700 ms), then pulse a glowing ring around the object for 2 s.
- Decrement the counter. Disabled at 0.

### Zoom
- iPad: pinch-to-zoom and pan **on the scene only** (not the whole page). Laptop: + / − buttons and mouse-wheel zoom; drag to pan.
- Clamp zoom between 1× and 2.5×; can't pan outside the image.
- All hit testing must use image coordinates, so it stays correct at any zoom/pan/screen size.

---

## 4. Screens

1. **Start screen (attract):** game title "وين الغرض؟" (placeholder — easy to change), short line "لاقِ ٦ أغراض من ثقافات مختلفة قبل ما يخلص الوقت", big button **"ابدأ"**. Light idle animation (floating objects).
2. **Stage intro (2 s):** shows the randomly chosen stage title + small map silhouette or flag row drawn in the UI (not in the image).
3. **Game screen:** scene fills the screen (object-fit: contain, letterbox with a blurred copy of the same image behind it), top bar (stage title, timer), bottom bar (slots + hint).
4. **End screen:** "أحسنت! 🎉" or "خلص الوقت ⏰", found count (e.g. ٥/٦), and a grid of the round's objects with their Arabic name + one-line fact (unfound ones shown greyed with "ما لقيتها"). Button **"لاعب جديد"**.
5. **Idle reset:** if no touch for **30 s** on any screen except Start, go back to Start.

Other:
- Landscape only. In portrait show "لف الجهاز بالعرض".
- Prevent double-tap zoom, text selection, long-press menus, and pull-to-refresh on iPad.
- A small hidden "staff" corner (long-press top-left for 3 s) to toggle sound and to show hitboxes (debug).
- Preload all 4 scene images + icons on the start screen.

---

## 5. Data format — `data/stages.json`

Coordinates are **normalized 0–1** relative to the image (x from left, y from top), so they don't depend on image size.

```json
{
  "stages": [
    {
      "id": "levant",
      "title": "بلاد الشام",
      "image": "img/levant.webp",
      "objects": [
        {
          "id": "mosaic-box",
          "name": "صندوق موزاييك",
          "fact": "صناعة دمشقية تقليدية: خشب مطعّم بالصدف.",
          "country": "سوريا",
          "rect": { "x": 0.412, "y": 0.633, "w": 0.051, "h": 0.042 },
          "icon": "img/icons/levant/mosaic-box.webp"
        }
      ]
    }
  ]
}
```

---

## 6. Hitbox editor — `editor.html` (build this FIRST)

Purpose: AI-generated images are flat, so object positions must be marked by hand.

- Load an image file (file input or drag & drop).
- Choose a stage from a dropdown (or create a new one) — the object list for that stage is pre-filled from the pool in §8 (name + fact).
- Select an object from the list → drag a rectangle on the image → it's saved to that object. Rectangles can be moved/resized/deleted. Show each rect with its name label.
- Allow **multiple rects per object** if the AI drew the same object twice (store as `"rects": [...]` — the game should accept either `rect` or `rects`, and any of them counts as found).
- **"Export"** button: downloads the updated `stages.json` **and** crops each object's rect from the image into a PNG/WebP icon (zip, or one-by-one downloads named `<objectId>.webp`).
- "Import" existing `stages.json` to continue editing.
- Zoom in the editor (wheel) for precise marking.

---

## 7. Image generation prompts (Codex / image model)

Generate at landscape 3:2 or 16:9, highest resolution available. Then **check each image manually**:
- each target object appears exactly once (or mark both with `rects`),
- no garbled text or flags in the image (all text/flags live in the UI),
- objects aren't too tiny for a finger (at least ~3% of image width).

Base template:
> Colorful illustrated hidden-object game scene, [SCENE]. Warm lighting, landscape, very high detail, densely cluttered with dozens of small everyday objects. Include exactly ONE of each: [OBJECT LIST], placed naturally and partly hidden among the clutter, each still recognizable. No text, no letters, no flags, no logos, no close-up faces.

- **levant:** "a traditional Damascene house courtyard with a central fountain, jasmine vines, an iwan, colored stone floor"
- **south-asia:** "a busy South Asian bazaar street with a colorfully painted truck, cycle rickshaws, spice and textile stalls"
- **africa-turkey-uganda:** "a large harbor bazaar with several stalls side by side: a Moroccan stall with tagines and lanterns, an Egyptian stall with lanterns and fezzes, a Turkish tea corner with mosaic lamps, an East African stall with woven baskets and drums"
- **saudi-yemen:** "a traditional Arabian heritage majlis with Hijazi wooden rawashin windows, a Yemeni stained-glass qamariya window, floor cushions, carpets"

Use the object names in English from §8 in the `[OBJECT LIST]`.

---

## 8. Object pools (name · English for the prompt · fact)

### levant — بلاد الشام
| id | الاسم | English | المعلومة |
|---|---|---|---|
| mosaic-box | صندوق موزاييك | mother-of-pearl inlaid wooden box | صناعة دمشقية تقليدية: خشب مطعّم بالصدف. |
| rakwe | ركوة | small brass coffee pot (rakweh) | إناء تُحضّر فيه القهوة على النار في بلاد الشام. |
| kufiya | كوفية | black-and-white checkered keffiyeh | رمز للتراث الفلسطيني بنقشها الأبيض والأسود. |
| tatreez | ثوب مطرّز | embroidered Palestinian dress | التطريز الفلسطيني تختلف نقوشه من مدينة لمدينة. |
| aleppo-soap | صابون غار | Aleppo laurel soap bars | صابون حلبي من زيت الزيتون وزيت الغار. |
| olive-oil | جرة زيت زيتون | clay jar of olive oil | الزيتون من أهم محاصيل بلاد الشام. |
| zaatar | زعتر | bowl of za'atar | خلطة زعتر وسماق وسمسم تُؤكل مع الخبز والزيت. |
| kaak | كعك بالسمسم | ring-shaped sesame bread (ka'ak) | خبز حلقي بالسمسم يُباع في أسواق القدس. |
| derbakeh | دربكة | goblet drum (darbuka) | طبلة حاضرة في الدبكة والأفراح. |
| oud | عود | oud | آلة وترية أساسية في الموسيقى العربية. |

### south-asia — باكستان والهند وبنجلادش وأفغانستان
| id | الاسم | English | المعلومة |
|---|---|---|---|
| rickshaw | ريكشا | small cycle rickshaw toy | دراجة لنقل الركاب، ودكا تُلقّب بعاصمة الريكشا. |
| truck-art-kettle | إبريق مزخرف | kettle painted in Pakistani truck-art style | فن الشاحنات الباكستاني: رسومات وألوان زاهية. |
| cricket-bat | مضرب كريكيت | cricket bat | الكريكيت أشهر رياضة في باكستان والهند وبنجلادش. |
| kulhad | كوب فخار | clay chai cups (kulhad) | كوب فخار يُشرب فيه الشاي الهندي (تشاي). |
| tabla | طبلة | pair of tabla drums | زوج طبول أساسي في الموسيقى الهندية والباكستانية. |
| bangles | أساور ملونة | colorful glass bangles | تُلبس في الأعراس والأعياد. |
| henna | مخروط حناء | henna cone | تُزيَّن بها الأيادي في الأعراس. |
| afghan-rug | سجادة أفغانية | small red Afghan rug | السجاد اليدوي من أشهر صناعات أفغانستان. |
| kite | طائرة ورقية | paper kite | لعبة الطائرات الورقية مشهورة في أفغانستان وباكستان. |
| karakul | قبعة كاراكول | karakul fur hat | قبعة من صوف خراف القراقل، مشهورة في أفغانستان. |
| mango | مانجو | mangoes | المانجو الفاكهة الوطنية للهند وباكستان. |
| jamdani | قماش جامداني | folded jamdani muslin sari | نسيج يدوي من بنجلادش، مسجّل في اليونسكو. |

### africa-turkey-uganda — الدول العربية في أفريقيا وتركيا وأوغندا
| id | الاسم | English | المعلومة |
|---|---|---|---|
| tagine | طاجين | Moroccan clay tagine | إناء فخار مخروطي للطبخ في المغرب. |
| babouche | بلغة | yellow leather babouche slippers | حذاء جلدي تقليدي في المغرب. |
| moroccan-teapot | براد شاي | silver Moroccan teapot | الشاي بالنعناع رمز الضيافة في المغرب العربي. |
| couscous | صحن كسكس | plate of couscous | طبق مشترك بين الجزائر والمغرب وتونس وموريتانيا. |
| chechia | شاشية | red Tunisian chechia cap | قبعة صوف حمراء تقليدية في تونس. |
| fanous | فانوس رمضان | Egyptian Ramadan lantern | الفانوس من أشهر رموز رمضان في مصر. |
| tarboush | طربوش | red fez with black tassel | غطاء رأس قديم ارتبط بمصر. |
| jebena | جبنة | Sudanese clay coffee pot (jebena) | إبريق فخار تُحضّر فيه القهوة في السودان. |
| somali-incense | مبخرة | Somali clay incense burner | البخور جزء من الضيافة في الصومال وجيبوتي. |
| turkish-tea | استكانة شاي | tulip-shaped Turkish tea glass | الشاي يُشرب في كاسات صغيرة بشكل التوليب في تركيا. |
| nazar | عين زرقاء | blue evil-eye glass charm | خرزة زرقاء تُعلّق للزينة في تركيا. |
| mosaic-lamp | فانوس موزاييك | Turkish mosaic glass lamp | فوانيس زجاج ملون مشهورة في أسواق إسطنبول. |
| cezve | جزوة | copper Turkish coffee pot (cezve) | إناء نحاسي للقهوة التركية. |
| engoma | طبل أوغندي | Ugandan cowhide drum | الطبول جزء أساسي من الاحتفالات في أوغندا. |
| barkcloth | قماش اللحاء | brown barkcloth fabric | قماش من لحاء الشجر في أوغندا، مسجّل في اليونسكو. |
| matooke | موز ماتوكي | bunch of green bananas (matooke) | الموز الأخضر المطبوخ طبق رئيسي في أوغندا. |

> This stage has a larger pool (16) because it covers more countries. Optional: when picking 6, try to include at least one from Maghreb, one Egypt/Sudan, one Turkey, one Uganda.

### saudi-yemen — السعودية واليمن
| id | الاسم | English | المعلومة |
|---|---|---|---|
| dallah | دلة | brass Arabic coffee pot (dallah) | رمز الضيافة والكرم في السعودية. |
| mabkhara | مبخرة | wooden incense burner (mabkhara) | يُطيَّب بها المجلس عند استقبال الضيوف. |
| finjan | فناجيل | small handleless coffee cups | تُقدَّم فيها القهوة العربية. |
| dates | تمر | bowl of dates | يُقدَّم مع القهوة في كل بيت سعودي. |
| shemagh | شماغ | red-and-white checkered shemagh | غطاء الرأس التقليدي للرجال في السعودية. |
| sadu | مسند سدو | Al Sadu woven cushion | نسيج بدوي تقليدي مسجّل في اليونسكو. |
| jambiya | جنبية | Yemeni jambiya with curved sheath and belt | تُلبس على الخصر في اللباس اليمني التقليدي. |
| yemeni-honey | عسل يمني | jar of honey | العسل الدوعني اليمني من أشهر أنواع العسل. |
| frankincense | لبان | frankincense resin in a small dish | اللبان من أقدم ما تاجرت به جزيرة العرب. |
| coffee-beans | حبوب بن | sack of coffee beans | اسم قهوة "موكا" جاء من ميناء المخا في اليمن. |
| qamariya | قمرية | small Yemeni stained-glass arch window | نافذة جصّ وزجاج ملون تزيّن البيوت اليمنية. |

---

## 9. Build order

1. `editor.html` (§6) — needed before any stage can be played.
2. Game core: load JSON, show one scene, hit testing with normalized coords, found/wrong feedback.
3. Bottom bar (4 slots + queue), timer, progress, hints.
4. Zoom/pan (pinch + buttons) keeping hit tests correct.
5. Screens: start → intro → game → end, random stage, idle reset.
6. Polish: sounds, sparkle hint, shake, iPad touch fixes.

## 10. Acceptance checklist

- [ ] Works in iPad Safari (landscape) and laptop Chrome, full screen, no page scroll/zoom.
- [ ] Taps hit correctly at any screen size and any zoom level.
- [ ] Same stage never appears twice in a row.
- [ ] Each round picks 6 different objects; all 6 are findable.
- [ ] Hint points at an unfound object; counter goes 3 → 0.
- [ ] Rapid wrong taps trigger the cooldown.
- [ ] 30 s idle returns to the start screen.
- [ ] Works offline after the first load.
- [ ] Debug toggle shows all hitboxes (to verify marking on the real device).
