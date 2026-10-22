#!/usr/bin/env python3
"""Тесты пайплайна данных: python3 scripts/test_build_data.py"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_data as b  # noqa: E402

# Те же таблицы проверяются в tests/text.test.ts — письмо и ключи обязаны совпадать.
CLEAN = [
    ("Ђурђевак", "đurđevak", "djurdjevak"),
    ("Šećer", "šećer", "secer"),
    ("ЉУБАВ", "ljubav", "ljubav"),
    ("džem", "džem", "dzem"),
    ("Čovek", "čovek", "covek"),
    ("pȁs", "pas", "pas"),
    ("кућа", "kuća", "kuca"),
    ("Шума", "šuma", "suma"),
    ("ĐAK", "đak", "djak"),
    ("hvala!", "hvala", "hvala"),
    ("  Moja  kuća, ", "moja kuća", "moja kuca"),
    ("rȉječ", "riječ", "rijec"),
]


class Helpers(unittest.TestCase):
    def test_fnv1a_golden(self) -> None:
        self.assertEqual(b.fnv1a(""), 2166136261)
        self.assertEqual(b.fnv1a("hello"), 1335831723)
        self.assertEqual(b.fnv1a("привет"), 2168984447)
        self.assertEqual(b.shard_of("pas", 256), 251)
        self.assertEqual(b.shard_of("kuća", 256), 63)
        self.assertEqual(b.shard_of("собака", 128), 56)
        self.assertEqual(b.shard_of("kuca", 128), 81)

    def test_clean_and_fold(self) -> None:
        for raw, clean, fold in CLEAN:
            self.assertEqual(b.clean_sr(raw), clean, raw)
            self.assertEqual(b.fold_sr(raw), fold, raw)

    def test_transliteration(self) -> None:
        self.assertEqual(b.to_cyrillic("Njegova kuća, ljubav i džem; đak"), "Његова кућа, љубав и џем; ђак")
        self.assertEqual(b.to_latin("Његова кућа, љубав и џем; ђак"), "Njegova kuća, ljubav i džem; đak")
        # кругооборот для обычных слов
        for w in ("srpski", "žena", "šuma", "ćao", "đak", "hvala", "lopta"):
            self.assertEqual(b.to_latin(b.to_cyrillic(w)), w)

    def test_norm_ru(self) -> None:
        self.assertEqual(b.norm_ru("  Моро́женое, "), "мороженое")
        self.assertEqual(b.norm_ru("Ёж"), "еж")


class Sample(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name) / "data"
        b.main(["--sample", "--out", str(cls.out)])

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def entry(self, key: str) -> dict:
        shard = b.shard_of(key, b.SHARDS_E)
        data = json.loads((self.out / "e" / f"{shard:03d}.json").read_text(encoding="utf-8"))
        return data[key]

    def test_meta(self) -> None:
        m = json.loads((self.out / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(m["words"], 12)
        self.assertGreater(m["forms"], 5)
        self.assertEqual(m["approx"], 2)
        self.assertEqual(m["exact"], 10)

    def test_exact_pairs(self) -> None:
        pas = self.entry("pas")
        self.assertEqual(pas["p"], "/pâs/")
        self.assertEqual(pas["gd"], "m anim")
        mean = pas["m"][0]
        self.assertEqual((mean["e"], mean["s"]), ("dog", "domestic animal"))
        self.assertEqual([t["w"] for t in mean["ru"]], ["собака", "пёс"])
        self.assertNotIn("a", mean)
        self.assertNotIn("c", pas)  # «пас» = обычная транслитерация
        self.assertIn(["psa", "genitive singular"], pas["f"])

    def test_approximate_level(self) -> None:
        cat = self.entry("mačka")
        self.assertEqual(cat["m"][0]["a"], 1)
        self.assertEqual([t["w"] for t in cat["m"][0]["ru"]], ["кошка", "кот"])

    def test_form_redirect(self) -> None:
        red = self.entry("psa")
        self.assertEqual(red["r"], ["pas"])
        self.assertEqual(red["rg"], "genitive singular")

    def test_words_index(self) -> None:
        lines = (self.out / "words.txt").read_text(encoding="utf-8").splitlines()
        keys = [ln.split("\t")[0] for ln in lines]
        self.assertEqual(keys, sorted(keys))
        self.assertIn("kuca\t50\tkuća", lines)
        self.assertIn("psa\t38\tpsa", lines)

    def test_reverse_index(self) -> None:
        def rev(k: str) -> list[str]:
            shard = b.shard_of(k, b.SHARDS_R)
            return json.loads((self.out / "r" / f"{shard:03d}.json").read_text(encoding="utf-8"))[k]

        self.assertEqual(rev("собака"), ["pas"])
        self.assertEqual(rev("друг"), ["drug", "prijatelj"])
        self.assertEqual(rev("кошка"), ["mačka"])  # приблизительный перевод тоже в индексе
        rw = (self.out / "rwords.txt").read_text(encoding="utf-8")
        self.assertIn("пес\t", rw)
        self.assertIn("\tпёс", rw)

    def test_sentences_by_fold_key(self) -> None:
        shard = b.shard_of("kuca", b.SHARDS_S)
        data = json.loads((self.out / "s" / f"{shard:03d}.json").read_text(encoding="utf-8"))
        self.assertEqual(data["kuca"][0][1], "Мой дом находится рядом с рекой.")
        # предложение с формой «psa» найдено по лемме pas
        shard = b.shard_of("pas", b.SHARDS_S)
        data = json.loads((self.out / "s" / f"{shard:03d}.json").read_text(encoding="utf-8"))
        self.assertIn("psa", data["pas"][0][0])

    def test_manifest(self) -> None:
        man = json.loads((self.out / "manifest.json").read_text(encoding="utf-8"))
        paths = {p for p, _s in man["files"]}
        self.assertIn("words.txt", paths)
        self.assertNotIn("manifest.json", paths)
        for p, size in man["files"]:
            self.assertEqual((self.out / p).stat().st_size, size, p)


class Prefilter(unittest.TestCase):
    def test_only_relevant_lines_parsed(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "x.jsonl"
            f.write_text(
                "\n".join(
                    [
                        json.dumps({"word": "a", "lang_code": "fr", "senses": []}),
                        json.dumps({"word": "dog", "lang_code": "en", "translations": [{"lang_code": "ru", "word": "пёс"}]}),
                        json.dumps({"word": "tree", "lang_code": "en", "senses": []}),  # без переводов — пропуск
                        json.dumps({"word": "pas", "lang_code": "sh", "senses": []}),
                        "{битая строка",
                    ]
                ),
                encoding="utf-8",
            )
            got = [e["word"] for e in b.iter_jsonl(f)]
            self.assertEqual(got, ["dog", "pas"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
