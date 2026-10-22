#!/usr/bin/env python3
"""Сборка словаря сербский ⇄ русский для приложения Rečnik.

Источники (все открытые):
  * Wiktionary через kaikki.org (wiktextract): сербохорватские статьи (значения, IPA, формы)
    и переводные таблицы английских статей (sh ↔ ru внутри одного значения).  CC BY-SA
  * wordfreq: частотность (Zipf) для ранжирования.  CC BY-SA
  * Tatoeba: пары предложений SR↔RU для примеров.  CC BY 2.0 FR

Прямого открытого сербско-русского словаря нет, поэтому переводы строятся через английский:
  уровень 1 — «точные»: sh- и ru-переводы стоят в одном значении одной английской статьи;
  уровень 2 — «приблизительные»: у сербской статьи простое английское значение («dog»),
              русские переводы берутся у английской статьи с той же частью речи. Помечаются флагом a=1.

Выход (шардированные JSON, public/data):
  meta.json / manifest.json
  words.txt   «ключ \\t zipf*10 \\t написание латиницей» — ключ: латиница без диакритики (fold_sr), отсортирован
  rwords.txt  «русский термин \\t оценка [\\t написание с ё]»
  e/NNN.json  статьи: { слово латиницей: статья | перенаправление формы }
  r/NNN.json  обратный индекс: { русский термин: [сербские слова] }
  s/NNN.json  предложения: { fold-ключ: [[sr, ru], ...] }

Запуск:
  python3 scripts/build_data.py --download        # полная сборка (качает ~3 ГБ)
  python3 scripts/build_data.py --sample          # крошечный образец для разработки и тестов
"""
from __future__ import annotations

import argparse
import bz2
import gzip
import io
import json
import re
import shutil
import sys
import tarfile
import time
import unicodedata
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import IO, Any, Callable, Iterable, Iterator

SCHEMA = 1
SHARDS_E = 256
SHARDS_R = 128
SHARDS_S = 128

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = Path(__file__).resolve().parent / "sample"

KAIKKI_URLS = ["https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz"]
TATOEBA_SRP = "https://downloads.tatoeba.org/exports/per_language/srp/srp_sentences.tsv.bz2"
TATOEBA_RUS = "https://downloads.tatoeba.org/exports/per_language/rus/rus_sentences.tsv.bz2"
TATOEBA_LINKS = "https://downloads.tatoeba.org/exports/links.tar.bz2"

SH_CODES = {"sh", "sr"}

# ───────────────────────── Общие функции ─────────────────────────


def fnv1a(text: str) -> int:
    """FNV-1a 32 бит по UTF-8 — должен совпадать с src/lib/hash.ts."""
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def shard_of(key: str, count: int) -> int:
    return fnv1a(key) % count


_SPACE = re.compile(r"\s+")
_EDGE = re.compile(r"^[\s\"'“”«»(\[]+|[\s\"'“”«»)\].,;:!?]+$")
CYR_RE = re.compile(r"[Ѐ-ӿ]")

# ───────────────────────── Сербский: письмо и ключи ─────────────────────────
# Должно совпадать с src/lib/text.ts (проверяется золотыми значениями в обоих тестах).

_C = "абвгдђежзијклљмнњопрстћуфхцчџш"
_L = ["a", "b", "v", "g", "d", "đ", "e", "ž", "z", "i", "j", "k", "l", "lj", "m", "n", "nj", "o",
      "p", "r", "s", "t", "ć", "u", "f", "h", "c", "č", "dž", "š"]
C2L = dict(zip(_C, _L))
L2C = {l: c for c, l in C2L.items()}  # включая диграфы lj, nj, dž
_KEEP_MARK = {("c", "́"), ("c", "̌"), ("s", "̌"), ("z", "̌")}
_FOLD = str.maketrans({"č": "c", "ć": "c", "š": "s", "ž": "z", "đ": "dj"})


def _strip_marks(s: str) -> str:
    """Убирает знаки ударения, оставляя č ć š ž."""
    out: list[str] = []
    for ch in unicodedata.normalize("NFD", s):
        if unicodedata.category(ch) == "Mn":
            if out and (out[-1], ch) in _KEEP_MARK:
                out.append(ch)
            continue
        out.append(ch)
    return unicodedata.normalize("NFC", "".join(out))


def to_latin(text: str) -> str:
    """Сербская кириллица → латиница (остальное без изменений); регистр сохраняется."""
    out: list[str] = []
    for ch in unicodedata.normalize("NFC", text):
        low = ch.lower()
        lat = C2L.get(low)
        if lat is None:
            out.append(ch)
        else:
            out.append(lat.capitalize() if ch != low else lat)
    return "".join(out)


def to_cyrillic(text: str) -> str:
    """Латиница → сербская кириллица (lj, nj, dž — одна буква). Исключения вроде «injekcija» не учитываются."""
    t = unicodedata.normalize("NFC", text)
    out: list[str] = []
    i = 0
    while i < len(t):
        two = t[i : i + 2].lower()
        if two in ("lj", "nj", "dž"):
            c = L2C[two]
            out.append(c.upper() if t[i].isupper() else c)
            i += 2
            continue
        ch = t[i]
        c = L2C.get(ch.lower())
        out.append((c.upper() if ch.isupper() else c) if c else ch)
        i += 1
    return "".join(out)


def clean_sr(text: str) -> str:
    """Каноническое написание сербского слова: латиница, нижний регистр, без ударений."""
    t = to_latin(text).lower()
    t = _strip_marks(t)
    t = _SPACE.sub(" ", t).strip()
    return _EDGE.sub("", t)


def fold_sr(text: str) -> str:
    """Ключ поиска: любая письменность → латиница без диакритики (đ → dj)."""
    return clean_sr(text).translate(_FOLD)


def norm_ru(text: str) -> str:
    """Ключ русского термина — как normalizeRu(): без ударений, ё→е, нижний регистр."""
    t = unicodedata.normalize("NFC", text).replace("́", "").replace("̀", "")
    t = _SPACE.sub(" ", t).strip()
    t = _EDGE.sub("", t)
    return t.lower().replace("ё", "е")


KEY_RE = re.compile(r"^[a-zčćšžđ][a-zčćšžđ' .\-]{0,39}$")


def log(*args: Any) -> None:
    print(*args, file=sys.stderr, flush=True)


def open_text(path: Path) -> IO[str]:
    name = path.name.lower()
    if name.endswith(".bz2"):
        return io.TextIOWrapper(bz2.open(path, "rb"), encoding="utf-8", errors="replace")
    if name.endswith(".gz"):
        return io.TextIOWrapper(gzip.open(path, "rb"), encoding="utf-8", errors="replace")
    return open(path, "r", encoding="utf-8", errors="replace")


def download(url: str, dest: Path, retries: int = 3) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        log(f"  кэш: {dest.name}")
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, retries + 1):
        try:
            log(f"  загрузка {url}")
            req = urllib.request.Request(url, headers={"User-Agent": "datalaw_recnik-data-build/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp, open(tmp, "wb") as out:
                total = int(resp.headers.get("Content-Length") or 0)
                done = 0
                mark = 0
                while True:
                    chunk = resp.read(1 << 20)
                    if not chunk:
                        break
                    out.write(chunk)
                    done += len(chunk)
                    if done - mark >= 200 << 20:
                        mark = done
                        log(f"    {done >> 20} МБ" + (f" / {total >> 20} МБ" if total else ""))
            tmp.rename(dest)
            return dest
        except Exception as e:  # noqa: BLE001 — сеть нестабильна, повторяем
            log(f"  ошибка ({attempt}/{retries}): {e}")
            time.sleep(3 * attempt)
    raise RuntimeError(f"Не удалось скачать {url}")


# ───────────────────────── Частотность ─────────────────────────


def make_zipf(required: bool) -> tuple[Callable[[str], float], bool]:
    """zipf(слово латиницей) → максимум по sr/hr/bs, латиницей и кириллицей."""
    try:
        from wordfreq import zipf_frequency  # type: ignore[import-not-found]
    except ImportError:
        if required:
            raise SystemExit("wordfreq не установлен: pip install wordfreq")
        log("ВНИМАНИЕ: wordfreq не найден — частотность не учитывается (только для образца/разработки).")
        return (lambda _w: 0.0), False

    def zipf(word: str) -> float:
        best = 0.0
        for form in (word, to_cyrillic(word)):
            for lang in ("sr", "hr", "bs"):
                try:
                    best = max(best, float(zipf_frequency(form, lang)))
                except Exception:  # noqa: BLE001 — язык может быть недоступен
                    continue
        return best

    return zipf, True


# ───────────────────────── Разбор Wiktionary ─────────────────────────

GENDER_TAGS = {
    "masculine": "m", "feminine": "f", "neuter": "n", "plural": "pl",
    "perfective": "pf", "imperfective": "impf", "animate": "anim", "inanimate": "inan",
}
FORM_SKIP_TAGS = {"table-tags", "inflection-template", "class", "romanization", "error-unrecognized-form"}
SKIP_POS = {"character", "symbol", "punct", "prefix", "suffix", "infix", "circumfix"}
POS_MAP = {
    "adj": "adjective", "adv": "adverb", "intj": "interjection", "prep": "preposition",
    "conj": "conjunction", "pron": "pronoun", "det": "determiner", "num": "numeral",
    "name": "proper noun", "abbrev": "abbreviation", "prep_phrase": "prepositional phrase",
    "adv_phrase": "adverbial phrase", "verb_phrase": "verb phrase",
}
CAPS = {"meanings": 24, "ru_per_meaning": 8, "defs_per_pos": 5, "forms": 60, "approx_ru": 5}
BAD_GLOSS = re.compile(r"(spelling of|form of|alternative|inflection of|misspelling|obsolete)", re.I)
SIMPLE_GLOSS = re.compile(r"^(?:to |a |an |the )?([a-z][a-z-]{1,24})$")


def code_of(obj: dict[str, Any]) -> Any:
    return obj.get("lang_code") or obj.get("code")


def clean_text(s: Any, limit: int | None = None) -> str:
    if not isinstance(s, str):
        return ""
    s = _SPACE.sub(" ", s).strip()
    if limit and len(s) > limit:
        s = s[: limit - 1].rstrip() + "…"
    return s


def clean_ru(word: Any) -> str | None:
    if not isinstance(word, str):
        return None
    w = unicodedata.normalize("NFC", word).replace("́", "").replace("̀", "")
    w = _SPACE.sub(" ", w).strip()
    if not w or len(w) > 60 or not CYR_RE.search(w) or "{{" in w or "[[" in w:
        return None
    return w


def pos_name(raw: Any) -> str:
    p = raw if isinstance(raw, str) else ""
    return POS_MAP.get(p, p).replace("_", " ")


def marks_of(tags: Iterable[str]) -> str:
    return " ".join(GENDER_TAGS[t] for t in tags if t in GENDER_TAGS)


class Acc:
    """Накопитель по сербскому слову (ключ — латиница с диакритикой)."""

    def __init__(self) -> None:
        self.cyr = ""
        self.ipa = ""
        self.gender = ""
        self.meanings: dict[tuple[str, str, str], dict[str, Any]] = {}
        self.defs: dict[str, list[str]] = {}
        self.forms: list[tuple[str, str]] = []
        self.pos_glosses: dict[str, list[str]] = {}

    def add_meaning(self, pos: str, en: str, sense: str, ru: list[dict[str, str]], approx: bool = False) -> None:
        k = (pos, en, sense)
        m = self.meanings.get(k)
        if m is None:
            m = self.meanings[k] = {"t": pos, "e": en, "ru": []}
            if sense:
                m["s"] = sense
            if approx:
                m["a"] = 1
        have = {t["w"] for t in m["ru"]}
        for t in ru:
            if t["w"] not in have:
                m["ru"].append(t)
                have.add(t["w"])

    @property
    def has_exact(self) -> bool:
        return any("a" not in m for m in self.meanings.values())


def ru_term(t: dict[str, Any]) -> dict[str, str] | None:
    w = clean_ru(t.get("word"))
    if not w:
        return None
    out = {"w": w}
    marks = marks_of(t.get("tags") or [])
    if marks:
        out["x"] = marks
    return out


def translation_groups(e: dict[str, Any]) -> dict[str, dict[str, list[dict[str, Any]]]]:
    """sense → {'sh': [...], 'ru': [...]} из переводов английской статьи."""
    raw: list[tuple[str, dict[str, Any]]] = []
    for t in e.get("translations") or []:
        if isinstance(t, dict):
            raw.append((clean_text(t.get("sense")), t))
    for s in e.get("senses") or []:
        if not isinstance(s, dict):
            continue
        gloss = clean_text((s.get("glosses") or [""])[-1] if s.get("glosses") else "")
        for t in s.get("translations") or []:
            if isinstance(t, dict):
                raw.append((clean_text(t.get("sense")) or gloss, t))
    groups: dict[str, dict[str, list[dict[str, Any]]]] = {}
    for sense, t in raw:
        c = code_of(t)
        if c in SH_CODES:
            groups.setdefault(sense, {"sh": [], "ru": []})["sh"].append(t)
        elif c == "ru":
            groups.setdefault(sense, {"sh": [], "ru": []})["ru"].append(t)
    return groups


class Collector:
    def __init__(self) -> None:
        self.accs: dict[str, Acc] = {}
        # (английское слово, часть речи) → русские переводы по порядку (для уровня 2)
        self.en_ru: dict[tuple[str, str], list[dict[str, str]]] = {}
        # форма → {лемма: теги}
        self.form_of: dict[str, dict[str, str]] = defaultdict(dict)
        # кириллическое написание → латиница (по статьям-вариантам)
        self.cyr_of: dict[str, str] = {}

    def acc(self, lat: str) -> Acc:
        a = self.accs.get(lat)
        if a is None:
            a = self.accs[lat] = Acc()
        return a

    # ── английская статья: пары sh ↔ ru ──
    def english(self, e: dict[str, Any]) -> None:
        word = e.get("word")
        pos = e.get("pos") or ""
        if not isinstance(word, str) or pos in SKIP_POS:
            return
        pos = pos_name(pos)
        groups = translation_groups(e)
        if not groups:
            return
        en = clean_text(word)
        ru_all: list[dict[str, str]] = []
        for sense, g in groups.items():
            terms = [x for x in (ru_term(t) for t in g["ru"]) if x]
            for x in terms:
                if all(y["w"] != x["w"] for y in ru_all):
                    ru_all.append(x)
            if not terms:
                continue
            for t in g["sh"]:
                w = t.get("word")
                if not isinstance(w, str):
                    continue
                lat = clean_sr(w)
                if not KEY_RE.match(lat):
                    continue
                acc = self.acc(lat)
                if CYR_RE.search(w) and to_latin(w).lower() == lat and not acc.cyr:
                    acc.cyr = unicodedata.normalize("NFC", w).lower()
                acc.add_meaning(pos, en, sense, terms[: CAPS["ru_per_meaning"]])
        if ru_all and re.match(r"^[a-z][a-z-]{1,24}$", en):
            self.en_ru.setdefault((en.lower(), pos), ru_all)

    # ── сербохорватская статья ──
    def serbo(self, e: dict[str, Any]) -> None:
        word = e.get("word")
        pos = e.get("pos") or ""
        if not isinstance(word, str) or pos in SKIP_POS:
            return
        pos = pos_name(pos)
        lat = clean_sr(word)
        if not KEY_RE.match(lat):
            return
        is_cyr = bool(CYR_RE.search(word))
        lemma_glosses: list[str] = []
        for s in e.get("senses") or []:
            if not isinstance(s, dict):
                continue
            tags = [x for x in (s.get("tags") or []) if isinstance(x, str)]
            alt = [x.get("word") for x in (s.get("alt_of") or []) if isinstance(x, dict)]
            fo = [x.get("word") for x in (s.get("form_of") or []) if isinstance(x, dict)]
            if alt:
                for target in alt:
                    if isinstance(target, str):
                        t_lat = clean_sr(target)
                        if is_cyr and t_lat == lat:
                            continue
                        if is_cyr and KEY_RE.match(t_lat):
                            self.cyr_of[t_lat] = unicodedata.normalize("NFC", word).lower()
                        elif KEY_RE.match(t_lat) and t_lat != lat:
                            self.form_of[lat][t_lat] = "variant"
                continue
            if fo:
                tag_text = " ".join(x for x in tags if x not in {"form-of", "alt-of"})
                for target in fo:
                    if isinstance(target, str):
                        t_lat = clean_sr(target)
                        if KEY_RE.match(t_lat) and t_lat != lat:
                            self.form_of[lat][t_lat] = tag_text
                continue
            glosses = s.get("glosses") or []
            g = clean_text(glosses[-1] if glosses else "", 160)
            if g and not BAD_GLOSS.search(g):
                lemma_glosses.append(g)
        if not lemma_glosses:
            return
        acc = self.acc(lat)
        if is_cyr and to_latin(word).lower() == lat and not acc.cyr:
            acc.cyr = unicodedata.normalize("NFC", word).lower()
        for g in lemma_glosses[: CAPS["defs_per_pos"]]:
            lst = acc.pos_glosses.setdefault(pos, [])
            if g not in lst:
                lst.append(g)
        for s in e.get("sounds") or []:
            ipa = clean_text(s.get("ipa")) if isinstance(s, dict) else ""
            if ipa and not acc.ipa:
                acc.ipa = ipa
        tags = [x for x in (e.get("tags") or []) if isinstance(x, str)]
        for s in e.get("senses") or []:
            if isinstance(s, dict):
                tags += [x for x in (s.get("tags") or []) if isinstance(x, str)]
        if not acc.gender:
            acc.gender = marks_of(dict.fromkeys(tags))
        seen = {f for f, _t in acc.forms}
        for f in e.get("forms") or []:
            if not isinstance(f, dict):
                continue
            ftags = [x for x in (f.get("tags") or []) if isinstance(x, str)]
            if FORM_SKIP_TAGS & set(ftags):
                continue
            form = clean_sr(f.get("form") or "")
            if not form or form == lat or form in seen or form in {"-", "—"} or not KEY_RE.match(form):
                continue
            seen.add(form)
            if len(acc.forms) < CAPS["forms"]:
                acc.forms.append((form, " ".join(ftags)))

    def feed(self, e: dict[str, Any]) -> None:
        c = code_of(e)
        if c == "en":
            self.english(e)
        elif c in SH_CODES:
            self.serbo(e)

    def apply_approximate(self) -> int:
        """Уровень 2: простое английское значение сербского слова → русские переводы английской статьи."""
        n = 0
        for acc in self.accs.values():
            if acc.has_exact:
                continue
            for pos, glosses in acc.pos_glosses.items():
                for g in glosses:
                    m = SIMPLE_GLOSS.match(g.lower())
                    if not m:
                        continue
                    ru = self.en_ru.get((m.group(1), pos))
                    if ru:
                        acc.add_meaning(pos, m.group(1), "", ru[: CAPS["approx_ru"]], approx=True)
                        n += 1
        return n


def iter_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    """Читает дамп, разбирая JSON только у нужных строк (английские с переводами на ru, сербохорватские)."""
    with open_text(path) as f:
        for n, line in enumerate(f, 1):
            if n % 500_000 == 0:
                log(f"    прочитано строк: {n:,}")
            if not line.strip():
                continue
            is_en = 'lang_code": "en"' in line or 'lang_code":"en"' in line or '"code": "en"' in line
            is_sh = (
                'lang_code": "sh"' in line or 'lang_code":"sh"' in line
                or 'lang_code": "sr"' in line or 'lang_code":"sr"' in line
            )
            if not (is_en or is_sh):
                continue
            if is_en and not ('"translations"' in line and '"ru"' in line):
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict):
                yield obj


# ───────────────────────── Tatoeba ─────────────────────────


def read_sentences(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    with open_text(path) as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 3:
                out[parts[0]] = parts[2]
    return out


def iter_links(path: Path) -> Iterator[tuple[str, str]]:
    name = path.name.lower()
    if name.endswith((".tar.bz2", ".tar.gz", ".tar")):
        with tarfile.open(path, "r:*") as tar:
            for member in tar:
                if member.isfile() and member.name.endswith(("links.csv", "links.tsv")):
                    f = tar.extractfile(member)
                    if f is None:
                        continue
                    for raw in io.TextIOWrapper(f, encoding="utf-8", errors="replace"):
                        a = raw.rstrip("\n").split("\t")
                        if len(a) >= 2:
                            yield a[0], a[1]
                    return
        return
    with open_text(path) as f:
        for raw in f:
            a = raw.rstrip("\n").split("\t")
            if len(a) >= 2:
                yield a[0], a[1]


TOKEN_RE = re.compile(r"[a-zčćšžđ]+")


def sentence_index(
    srp: Path, rus: Path, links: Path, keys: dict[str, set[str]], per_key: int = 5
) -> dict[str, list[list[str]]]:
    """keys: fold-ключ → множество fold-ключей лемм, к которым он ведёт (для форм — лемма)."""
    sr = read_sentences(srp)
    ru = read_sentences(rus)
    pairs: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for a, b in iter_links(links):
        if a in sr and b in ru and (a, b) not in seen:
            seen.add((a, b))
            pairs.append((sr[a], ru[b]))
    found: dict[str, list[tuple[int, str, str]]] = defaultdict(list)
    for s_text, r_text in pairs:
        if not 12 <= len(s_text) <= 140:
            continue
        toks = set(TOKEN_RE.findall(to_latin(s_text).lower()))
        targets: set[str] = set()
        for tok in toks:
            f = tok.translate(_FOLD)
            targets |= keys.get(f, set())
        for key in targets:
            found[key].append((abs(len(s_text) - 55), s_text, r_text))
    out: dict[str, list[list[str]]] = {}
    for key, items in found.items():
        items.sort(key=lambda x: (x[0], x[1]))
        chosen: list[list[str]] = []
        used: set[str] = set()
        for _d, s_text, r_text in items:
            if s_text in used:
                continue
            used.add(s_text)
            chosen.append([s_text, r_text])
            if len(chosen) >= per_key:
                break
        out[key] = chosen
    return out


# ───────────────────────── Запись результата ─────────────────────────


def dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def write_shards(out: Path, folder: str, count: int, items: dict[str, Any]) -> int:
    buckets: dict[int, dict[str, Any]] = defaultdict(dict)
    for k, v in items.items():
        buckets[shard_of(k, count)][k] = v
    target = out / folder
    target.mkdir(parents=True, exist_ok=True)
    for idx, bucket in buckets.items():
        (target / f"{idx:03d}.json").write_text(dump(bucket), encoding="utf-8")
    return len(buckets)


def finalize(lat: str, acc: Acc, z10: int) -> dict[str, Any] | None:
    meanings = list(acc.meanings.values())
    if not meanings:
        return None
    # точные значения — выше приблизительных
    meanings.sort(key=lambda m: 1 if m.get("a") else 0)
    art: dict[str, Any] = {"w": lat, "z": z10}
    if acc.cyr and acc.cyr != to_cyrillic(lat):
        art["c"] = acc.cyr
    if acc.ipa:
        art["p"] = acc.ipa
    if acc.gender:
        art["gd"] = acc.gender
    art["m"] = [
        {**{k: v for k, v in m.items() if k != "ru"}, "ru": m["ru"][: CAPS["ru_per_meaning"]]}
        for m in meanings[: CAPS["meanings"]]
    ]
    defs = [{"t": pos, "g": gl[: CAPS["defs_per_pos"]]} for pos, gl in acc.pos_glosses.items() if gl]
    if defs:
        art["d"] = defs
    if acc.forms:
        art["f"] = [[f, t] for f, t in acc.forms]
    return art


def build(
    kaikki: list[Path],
    out: Path,
    zipf: Callable[[str], float],
    have_freq: bool,
    tatoeba: tuple[Path, Path, Path] | None,
    max_words: int,
) -> dict[str, Any]:
    log("Разбор Wiktionary…")
    col = Collector()
    for path in kaikki:
        for e in iter_jsonl(path):
            col.feed(e)
    approx = col.apply_approximate()
    log(f"  слов с данными: {len(col.accs):,}; приблизительных значений: {approx:,}; форм-ссылок: {len(col.form_of):,}")

    ranked: list[tuple[float, str]] = []
    zc: dict[str, float] = {}
    for lat, acc in col.accs.items():
        if not acc.meanings:
            continue
        z = zipf(lat)
        zc[lat] = z
        ranked.append((z + (0.7 if acc.has_exact else 0.0), lat))
    ranked.sort(key=lambda x: (-x[0], x[1]))
    chosen = [k for _s, k in ranked[:max_words]]
    log(f"  отобрано слов: {len(chosen):,}")

    entries: dict[str, dict[str, Any]] = {}
    for lat in chosen:
        z10 = int(round(min(max(zc.get(lat, 0.0), 0.0), 8.0) * 10))
        acc = col.accs[lat]
        if lat in col.cyr_of and not acc.cyr and to_latin(col.cyr_of[lat]).lower() == lat:
            acc.cyr = col.cyr_of[lat]
        art = finalize(lat, acc, z10)
        if art:
            entries[lat] = art

    # перенаправления форм на леммы (из статей form_of и из таблиц форм)
    forms: dict[str, dict[str, str]] = defaultdict(dict)
    for form, targets in col.form_of.items():
        for lemma, tags in targets.items():
            if lemma in entries:
                forms[form][lemma] = tags
    for lemma, art in entries.items():
        for f, tags in art.get("f", []):
            forms[f].setdefault(lemma, tags)
    redirects: dict[str, dict[str, Any]] = {}
    for form, targets in forms.items():
        if form in entries or not KEY_RE.match(form):
            continue
        lemmas = sorted(targets, key=lambda l: -entries[l]["z"])[:3]
        tags = next((t for t in (targets[l] for l in lemmas) if t), "")
        red: dict[str, Any] = {"w": form, "r": lemmas}
        if tags:
            red["rg"] = tags
        redirects[form] = red

    # Обратный индекс RU → SR
    log("Обратный индекс RU→SR…")
    reverse: dict[str, dict[str, float]] = defaultdict(dict)
    display: dict[str, str] = {}
    for lat, art in entries.items():
        for m in art["m"]:
            bonus = 0.0 if m.get("a") else 100.0
            for t in m["ru"]:
                rk = norm_ru(t["w"])
                if not rk or len(rk) > 40:
                    continue
                score = bonus + art["z"]
                reverse[rk][lat] = max(reverse[rk].get(lat, -1), score)
                if rk != t["w"].lower() and rk not in display:
                    display[rk] = t["w"].lower()
    rev_out = {
        rk: [w for w, _s in sorted(m.items(), key=lambda kv: (-kv[1], kv[0]))[:40]] for rk, m in reverse.items()
    }

    sentences: dict[str, list[list[str]]] = {}
    if tatoeba:
        try:
            keys: dict[str, set[str]] = defaultdict(set)
            for lat in entries:
                keys[fold_sr(lat)].add(fold_sr(lat))
            for form, red in redirects.items():
                for lemma in red["r"]:
                    keys[fold_sr(form)].add(fold_sr(lemma))
            sentences = sentence_index(*tatoeba, keys=keys)
        except Exception as e:  # noqa: BLE001
            log(f"  Tatoeba пропущена: {e}")

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    all_entries = {**redirects, **entries}
    n_e = write_shards(out, "e", SHARDS_E, all_entries)
    n_r = write_shards(out, "r", SHARDS_R, rev_out)
    n_s = write_shards(out, "s", SHARDS_S, sentences) if sentences else 0

    lines: list[tuple[str, int, str]] = []
    for lat, art in entries.items():
        lines.append((fold_sr(lat), art["z"], lat))
    for form, red in redirects.items():
        lz = max(entries[l]["z"] for l in red["r"])
        lines.append((fold_sr(form), max(0, lz - 8), form))
    lines.sort(key=lambda x: (x[0], -x[1], x[2]))
    (out / "words.txt").write_text("\n".join(f"{k}\t{z}\t{d}" for k, z, d in lines) + "\n", encoding="utf-8")
    rlines = []
    for rk in sorted(rev_out):
        score = max(reverse[rk].values())
        rlines.append(f"{rk}\t{int(score)}" + (f"\t{display[rk]}" if rk in display else ""))
    (out / "rwords.txt").write_text("\n".join(rlines) + "\n", encoding="utf-8")

    meta = {
        "schema": SCHEMA,
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "words": len(entries),
        "forms": len(redirects),
        "exact": sum(1 for a in entries.values() if any("a" not in m for m in a["m"])),
        "approx": sum(1 for a in entries.values() if all("a" in m for m in a["m"])),
        "ruTerms": len(rev_out),
        "sentences": sum(len(v) for v in sentences.values()),
        "shards": {"e": SHARDS_E, "r": SHARDS_R, "s": SHARDS_S},
        "files": {"e": n_e, "r": n_r, "s": n_s},
        "frequency": have_freq,
        "sources": ["Wiktionary (kaikki.org, CC BY-SA)", "wordfreq (CC BY-SA)", "Tatoeba (CC BY 2.0 FR)"],
    }
    (out / "meta.json").write_text(dump(meta), encoding="utf-8")

    listing = sorted((f.relative_to(out).as_posix(), f.stat().st_size) for f in out.rglob("*") if f.is_file())
    manifest = {
        "version": meta["built"],
        "total": sum(sz for _p, sz in listing),
        "files": [[path, sz] for path, sz in listing],
    }
    (out / "manifest.json").write_text(dump(manifest), encoding="utf-8")
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    log(f"Готово: {meta['words']:,} слов ({meta['exact']:,} с точными переводами), {meta['forms']:,} форм, "
        f"{meta['ruTerms']:,} русских терминов, {meta['sentences']:,} предложений, {size / 1e6:.1f} МБ → {out}")
    return meta


# ───────────────────────── CLI ─────────────────────────


def fetch_kaikki(cache: Path, urls: list[str]) -> Path:
    last: Exception | None = None
    for url in urls:
        try:
            return download(url, cache / Path(url).name)
        except Exception as e:  # noqa: BLE001
            last = e
            log(f"  недоступно: {url}")
    raise SystemExit(f"Не удалось скачать дамп kaikki: {last}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Сборка словаря сербский ⇄ русский datalaw_recnik")
    ap.add_argument("--out", type=Path, default=ROOT / "public" / "data")
    ap.add_argument("--cache", type=Path, default=ROOT / ".data-cache")
    ap.add_argument("--download", action="store_true", help="скачать исходные дампы")
    ap.add_argument("--sample", action="store_true", help="собрать крошечный образец (без сети)")
    ap.add_argument("--kaikki", type=Path, action="append", default=[], help="файл дампа (можно несколько)")
    ap.add_argument("--kaikki-url", action="append", default=[])
    ap.add_argument("--tatoeba-srp", type=Path)
    ap.add_argument("--tatoeba-rus", type=Path)
    ap.add_argument("--tatoeba-links", type=Path)
    ap.add_argument("--no-tatoeba", action="store_true")
    ap.add_argument("--max-words", type=int, default=120_000)
    ap.add_argument("--require-wordfreq", action="store_true")
    a = ap.parse_args(argv)

    tatoeba: tuple[Path, Path, Path] | None = None
    if a.sample:
        kaikki = [SAMPLE / "kaikki-sample.jsonl"]
        tatoeba = (SAMPLE / "tatoeba-srp.tsv", SAMPLE / "tatoeba-rus.tsv", SAMPLE / "tatoeba-links.tsv")
        zipf, have_freq = _sample_zipf, True
    else:
        zipf, have_freq = make_zipf(a.require_wordfreq)
        if a.kaikki:
            kaikki = a.kaikki
        elif a.download:
            kaikki = [fetch_kaikki(a.cache, a.kaikki_url or KAIKKI_URLS)]
        else:
            ap.error("укажите --download, --sample или --kaikki ФАЙЛ")
        if not a.no_tatoeba:
            try:
                srp = a.tatoeba_srp or (download(TATOEBA_SRP, a.cache / "srp_sentences.tsv.bz2") if a.download else None)
                rus = a.tatoeba_rus or (download(TATOEBA_RUS, a.cache / "rus_sentences.tsv.bz2") if a.download else None)
                lnk = a.tatoeba_links or (download(TATOEBA_LINKS, a.cache / "links.tar.bz2") if a.download else None)
                if srp and rus and lnk:
                    tatoeba = (srp, rus, lnk)
            except Exception as e:  # noqa: BLE001
                log(f"ВНИМАНИЕ: Tatoeba недоступна, примеры-предложения не будут собраны: {e}")

    build(kaikki, a.out, zipf, have_freq, tatoeba, a.max_words)
    return 0


_SAMPLE_Z = {"pas": 4.6, "kuća": 5.0, "voda": 5.2, "zdravo": 4.1, "dobar": 5.1, "knjiga": 4.8, "trčati": 3.9, "hvala": 5.0}


def _sample_zipf(w: str) -> float:
    return _SAMPLE_Z.get(w, 3.0)


if __name__ == "__main__":
    raise SystemExit(main())
