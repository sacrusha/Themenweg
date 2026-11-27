#!/usr/bin/env python3
"""Speech files for a trail's texts (docs/design/trail-content.md, Audio).

For every text.<lang>.md in the trail folder (the trail's own and each
station's) this writes audio.<lang>.mp3 beside it, from reading.<lang>.md
in its place where there is one, spoken by a Microsoft
neural voice through edge-tts (unofficial endpoint, no key; fine for a demo).

    pip install edge-tts
    python src/build/make-audio.py [trail folder] [--lang de] [--force] [--dry-run]

Without a folder it uses THEMENWEG_TRAIL, as the build does, or the only one
under trails/. It is incremental: a file is two parts, the intro (a
station's number and title) and the rest, each spoken on its own and joined.
audio.json in the trail folder records, for each file this script wrote, a
hash of each part's words, where the intro ends, the file's size and hash,
and the hash the site's check compares (source_hash). A part whose words are
unchanged is kept from the file as it is, so a station's new number remakes
only its intro. A file in a folder that was renamed is found by its hash. A
file that audio.json does not list, or of another size than the one listed
(a real recording put in the same slot), is never overwritten, even with
--force unless --overwrite-recordings is also given.

Settings come from an optional "audio" object in trail.json, read by this
script only (the site ignores it):

    "audio": {
      "voices": { "de": "de-CH-LeniNeural" },   // per language; defaults below
      "rate": "-5%",                            // speaking speed, edge-tts syntax,
                                                // or { "de": "+8%" } per language
      "say": { "WWF": "W W F" },                // pronunciation: written -> spoken
                                                // a value may be { "de": "…", "en": "…" } to say it per language
      "captions": true                          // the photos' captions spoken after the text, where there is no reading
    }
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import hashlib
import json
import os
import re
import sys
import tempfile
import time
from pathlib import Path

DEFAULT_VOICES = {
    "de": "de-CH-LeniNeural",  # Swiss Standard German
    "en": "en-GB-SoniaNeural",
    "fr": "fr-CH-ArianeNeural",
    "it": "it-IT-ElsaNeural",
}
# Said before a station's title, so the listener can match it to the sign.
STATION_WORD = {"de": "Station", "en": "Station", "fr": "Station", "it": "Stazione"}
MANIFEST = "audio.json"
DEFAULT_RATE = "-5%"
# edge-tts writes MP3 at 48 kbit/s, 6000 bytes a second; the voices speak 10 to
# 19 characters a second. The endpoint sometimes ends a file early without an
# error: a file of fewer bytes than the text at 25 characters a second is cut short.
MIN_BYTES_PER_CHAR = 6000 / 25
BOM = "\ufeff"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def find_trail(arg: str | None) -> Path:
    """The folder: the argument (a name under trails/ or demo/, or a path from here), else THEMENWEG_TRAIL (a name, or a path from the repository, as the build reads it), else the only trail under trails/, else the demo's."""
    repo = Path(__file__).resolve().parents[2]
    env = os.environ.get("THEMENWEG_TRAIL")
    name, base = (arg, Path.cwd()) if arg else (env, repo)
    if name:
        is_name = Path(name).name == name and name not in (".", "..")
        named = [p for p in (repo / "trails" / name, repo / "demo" / name) if is_name and p.exists()]
        d = named[0] if named else (base / name).resolve()
    else:
        found = [p for p in (repo / "trails").glob("*") if (p / "trail.json").exists()]
        if len(found) > 1:
            sys.exit(f"Several trails under trails/ ({len(found)}): name one.")
        found = found or [p for p in (repo / "demo").glob("*") if (p / "trail.json").exists()]
        if len(found) != 1:
            sys.exit("No trail under trails/: name one.")
        d = found[0]
    if not (d / "trail.json").exists():
        sys.exit(f"No trail.json in {d}")
    return d


def source_hash(title: str, md: str, captions: list[str]) -> str:
    """What the site's check recomputes (build/trail.ts): title, newline, text with LF line ends; then each caption spoken, after a blank line."""
    text = md.replace("\r\n", "\n").replace(BOM, "")
    return hashlib.sha256("".join([f"{title}\n{text}", *(f"\n\n{c}" for c in captions)]).encode("utf-8")).hexdigest()


HTML_NAMES = (
    "a abbr address article aside b bdi bdo blockquote body br caption cite code col colgroup dd del details dfn div "
    "dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr i img ins kbd li main mark nav ol p "
    "pre q s samp section small span strong sub summary sup table tbody td template tfoot th thead tr u ul var wbr "
    "script style"
).split()
HTML_PIECE = re.compile(
    r"<!--.*?-->"
    r"|<(?P<end>/)?(?P<name>" + "|".join(HTML_NAMES) + r")\b(?P<attrs>(?:\"[^\"]*\"|'[^']*'|[^>\"'])*)>",
    re.S | re.I,
)
HTML_BLOCKS = set("address article aside blockquote body dd details div dl dt fieldset figcaption figure footer form "
                  "h1 h2 h3 h4 h5 h6 header hr main nav ol p pre section summary table tbody tfoot thead ul".split())
CELL, ROW = "\x1f", "\x1e"  # placeholders while the text is assembled


def html_spoken(t: str) -> str:
    """Raw HTML in a text as a reader of the card meets it: tags dropped, their text kept.

    A closed <details> shows only its <summary>, so only that is spoken (an
    open one is spoken whole); comments, <script>, <style> and <template>
    are not shown at all. Table cells are read as a list, a row to a sentence.
    A text without any HTML is returned as it is.
    """
    if not HTML_PIECE.search(t):
        return t
    t = re.sub(r"<(script|style|template)\b.*?</\1\s*>", "", t, flags=re.S | re.I)
    out: list[str] = []
    stack: list[bool | None] = []  # per open <details>: is it open; None for the <summary> inside it

    def shown() -> bool:
        for i, is_open in enumerate(stack):
            if is_open is False and not (i == len(stack) - 2 and stack[-1] is None):
                return False
        return True

    pos = 0
    for m in HTML_PIECE.finditer(t):
        if shown():
            out.append(t[pos:m.start()])
        pos = m.end()
        name = (m.group("name") or "").lower()
        closing = bool(m.group("end"))
        if name == "details":
            if not closing:
                stack.append(bool(re.search(r"(?:^|\s)open\b", m.group("attrs"), re.I)))
            else:
                while stack and stack.pop() is None:
                    pass
        elif name == "summary" and stack:
            if not closing and stack[-1] is not None:
                stack.append(None)
            elif closing and stack[-1] is None:
                stack.pop()
        if not shown():
            continue
        if name in ("td", "th") and closing:
            out.append(CELL)
        elif name == "tr" and closing:
            out.append(ROW)
        elif name in HTML_BLOCKS:
            out.append("\n\n")
        elif name in ("br", "li", "caption"):
            out.append("\n")
    if shown():
        out.append(t[pos:])
    t = "".join(out)
    t = re.sub(CELL + r"\s*(?=" + ROW + ")", "", t)
    t = t.replace(CELL, ", ")
    t = re.sub(r"([^.!?:\s])[ \t]*" + ROW, r"\1.\n", t).replace(ROW, "\n")
    return re.sub(r"[ \t]*\n[ \t]*", "\n", t)


def plain(md: str) -> str:
    """The text as it is said: HTML and Markdown reduced to sentences."""
    t = html_spoken(md.replace(BOM, ""))
    t = re.sub(r"^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$", "", t, flags=re.M)  # thematic breaks: a pause, not a word
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)  # links: their text
    t = re.sub(r"(\*\*|__)(.+?)\1", r"\2", t)  # bold
    t = re.sub(r"(\*|_)(.+?)\1", r"\2", t)  # emphasis
    t = re.sub(r"^#+\s*", "", t, flags=re.M)
    t = re.sub(r"[ \t]+", " ", t)
    return re.sub(r"\n{2,}", "\n\n", t).strip()


def say_for(say: dict, lang: str) -> dict[str, str]:
    """The pronunciation map for one language: a string value applies to every language, an object per language."""
    out = {}
    for written, said in say.items():
        said = said.get(lang) if isinstance(said, dict) else said
        if said:
            out[written] = said
    return out


GERMAN_ONES = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf",
               "zwölf", "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"]
GERMAN_TENS = ["", "", "zwanzig", "dreissig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"]


def german_number(n: int) -> str:
    """1..999 as German words (Swiss spelling: dreissig, no ß)."""
    if n < 20:
        return GERMAN_ONES[n]
    if n < 100:
        tens, ones = divmod(n, 10)
        return GERMAN_TENS[tens] if not ones else ("ein" if ones == 1 else GERMAN_ONES[ones]) + "und" + GERMAN_TENS[tens]
    hundreds, rest = divmod(n, 100)
    return ("ein" if hundreds == 1 else GERMAN_ONES[hundreds]) + "hundert" + (german_number(rest) if rest else "")


def run_on_short_openers(text: str) -> str:
    """Join a paragraph's very short first sentence to the next with a comma.

    The multilingual German voice decides its language sentence by sentence;
    a sentence of four words or fewer ("Eulen jagen nachts.") that
    stands first in a paragraph can come out English. Followed by a comma it
    is heard together with the sentence after it. A full stop after a number
    or a word of two letters or fewer is taken for an ordinal or an
    abbreviation ("Ab dem 17. Jahrhundert", "St. Gallen", "z. B."), not a
    sentence's end.
    """
    def join(par: str) -> str:
        m = re.match(r"([^.!?]+)\.(\s+\S)", par)
        words = m.group(1).split() if m else []
        if not words or len(words) > 4 or words[-1].isdigit() or len(words[-1]) <= 2:
            return par
        return f"{m.group(1)},{par[m.end(1) + 1:]}"

    return "\n\n".join(join(par) for par in text.split("\n\n"))


def spoken(n: int, title: str, md: str, lang: str, say: dict[str, str], captions: list[str]) -> tuple[str, str]:
    """The intro (for a station: its number and title; item 0: its title); and the rest: the text, and the captions where they are spoken.

    German: "Hier ist Station zwei: Title." The number is a word because German
    reads "2." as an ordinal ("zweiter"). The title stays in the one sentence
    with German words before it, because the multilingual German voice decides
    its language sentence by sentence and a short title of its own ("Alte
    Riesen.") can come out English.
    """
    if not n:
        head = f"{title}."
    elif lang == "de":
        head = f"Hier ist {STATION_WORD['de']} {german_number(n)}: {title}."
    else:
        head = f"{STATION_WORD.get(lang, 'Station')} {n}. {title}."
    body = "\n\n".join([plain(md), *map(plain, captions)])
    if lang == "de":
        body = run_on_short_openers(body)
    for written, said in say.items():
        head, body = head.replace(written, said), body.replace(written, said)
    return head, body


def sha(data: str | bytes) -> str:
    return hashlib.sha256(data.encode("utf-8") if isinstance(data, str) else data).hexdigest()


# Spoken alone, the intro ends in about 0.1 s more silence than the voice leaves
# before a paragraph that follows in the same request: 4 MP3 frames of 24 ms.
INTRO_EXTRA_FRAMES = 4


def frame_ends(mp3: bytes) -> list[tuple[int, bool]] | None:
    """(end offset, silent) per frame of edge-tts's MP3 (MPEG-2 Layer III, mono); None for anything else.

    A silent frame is one without audio data (part2_3_length 0): leaving it
    out changes no other frame.
    """
    out, i = [], 0
    while i + 13 <= len(mp3):
        h = int.from_bytes(mp3[i:i + 4], "big")
        br = (0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0)[(h >> 12) & 15]
        sr = (22050, 24000, 16000, 0)[(h >> 10) & 3]
        if h >> 21 != 0x7FF or (h >> 19) & 3 != 2 or (h >> 17) & 3 != 1 or (h >> 6) & 3 != 3 or not br or not sr:
            return None
        side = i + 4 + (0 if (h >> 16) & 1 else 2)
        silent = (int.from_bytes(mp3[side + 1:side + 3], "big") >> 3) & 0xFFF == 0
        i += 72000 * br // sr + ((h >> 9) & 1)
        out.append((i, silent))
    return out if i == len(mp3) else None


def trim_intro(mp3: bytes) -> bytes:
    """The intro without its extra silence at the end, where it is the stream edge-tts writes."""
    ends = frame_ends(mp3)
    if not ends:
        return mp3
    silent = next((k for k, (_, s) in enumerate(reversed(ends)) if not s), len(ends))
    drop = min(INTRO_EXTRA_FRAMES, silent - 1)
    return mp3[:ends[-1 - drop][0]] if drop > 0 else mp3


def declare_voice_locale() -> None:
    """Make edge-tts declare a multilingual voice's own locale in the request.

    edge-tts writes xml:lang='en-US' on every request. A multilingual voice
    (de-DE-SeraphinaMultilingualNeural) chooses its language from the text and
    that declaration, so a short German sentence made of a word English shares
    ("Station") could be read in English. Voices that are not multilingual
    are left as they were.
    """
    from edge_tts import communicate

    if getattr(communicate.mkssml, "declares_locale", False):
        return
    original = communicate.mkssml

    def mkssml(tc, escaped_text):
        ssml = original(tc, escaped_text)
        # tc.voice is edge-tts's long form: "Microsoft Server Speech Text to Speech Voice (de-DE, SeraphinaMultilingualNeural)"
        found = re.search(r"\(([a-z]{2,3}-[A-Za-z0-9]+), \w*Multilingual\w*\)", tc.voice)
        if found:
            ssml = ssml.replace("xml:lang='en-US'", f"xml:lang='{found.group(1)}'", 1)
        return ssml

    mkssml.declares_locale = True
    communicate.mkssml = mkssml


def part_file(out: Path) -> Path:
    """A file in the part folder, its name this run's own: runs for other trails share the folder."""
    fd, name = tempfile.mkstemp(suffix=".part", prefix=f"{out.parent.name}-{out.stem}-", dir=part_dir(out))
    os.close(fd)
    return Path(name)


async def synth(text: str, voice: str, rate: str, out: Path) -> bytes:
    """One part of `out`, spoken: an MP3 stream of its own, so two joined play as one."""
    import edge_tts  # imported late so --dry-run works without it

    declare_voice_locale()
    tmp = part_file(out)
    sweep_old(tmp.parent)
    last: Exception | None = None
    try:
        for attempt in range(3):
            try:
                await edge_tts.Communicate(text, voice, rate=rate).save(str(tmp))
                data = tmp.read_bytes()
                if len(data) < max(1000, len(text) * MIN_BYTES_PER_CHAR):
                    raise RuntimeError(f"audio cut short: {len(data)} bytes for {len(text)} characters")
                return data
            except Exception as e:  # network, endpoint hiccup: retry
                last = e
                await asyncio.sleep(2 * (attempt + 1))
    finally:
        tmp.unlink(missing_ok=True)
    raise RuntimeError(f"{out}: {last}")


async def write(data: bytes, out: Path) -> None:
    """The file put in place, written in the part folder first: a dev server watching
    the trail folder re-reads its audio on every change, and on Windows a file it
    is reading can't be replaced. Same drive, so the final move is atomic."""
    tmp = part_file(out)
    tmp.write_bytes(data)
    await replace_when_free(tmp, out)


def part_dir(out: Path) -> Path:
    """A scratch folder on the same drive as `out`, outside any watched tree."""
    for parent in out.resolve().parents:
        if (parent / "src").is_dir() and ((parent / "trails").is_dir() or (parent / "demo").is_dir()):
            d = parent / ".cache" / "audio"
            break
    else:
        d = out.parent
    d.mkdir(parents=True, exist_ok=True)
    return d


async def replace_when_free(tmp: Path, out: Path) -> None:
    """Put the new file in place even while something streams the old one.

    A dev server serving the old file to a browser that has paused the
    download keeps it open for as long as the page lives; Windows then
    refuses to replace it, but allows renaming it (Node opens files with
    share-delete). So the old file is moved aside into the part folder and
    deleted there, now or on a later run.
    """
    try:
        tmp.replace(out)
        return
    except PermissionError:
        pass
    aside = part_dir(out) / f"{out.parent.name}-{out.name}.{os.getpid()}.old"
    out.replace(aside)
    tmp.replace(out)
    try:
        aside.unlink()
    except PermissionError:
        pass


@contextlib.contextmanager
def manifest_lock(manifest: Path):
    """audio.json to one run at a time while it reads and writes it; a lock older than a minute is a crashed run's."""
    lock = manifest.with_name(manifest.name + ".lock")
    while True:
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            break
        except FileExistsError:
            try:
                if time.time() - lock.stat().st_mtime > 60:
                    lock.unlink()
            except FileNotFoundError:
                pass
            time.sleep(0.1)
    try:
        yield
    finally:
        os.close(fd)
        lock.unlink(missing_ok=True)


def sweep_old(out_dir: Path) -> None:
    """Delete files moved aside by earlier runs whose readers have gone, and part files an interrupted run left."""
    hour_ago = time.time() - 3600
    for f in [*out_dir.glob("*.old"), *out_dir.glob("*.part")]:
        try:
            if f.suffix == ".old" or f.stat().st_mtime < hour_ago:
                f.unlink()
        except (PermissionError, FileNotFoundError):
            pass


async def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to a legacy code page
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("trail", nargs="?", help="trail folder (name under trails/ or demo/, or path)")
    ap.add_argument("--lang", action="append", help="only this language (repeatable)")
    ap.add_argument("--force", action="store_true", help="regenerate files whose source is unchanged")
    ap.add_argument("--overwrite-recordings", action="store_true", help="also replace files not made by this script")
    ap.add_argument("--dry-run", action="store_true", help="print what would be spoken, write nothing")
    args = ap.parse_args()

    trail = find_trail(args.trail)
    cfg = read_json(trail / "trail.json")
    audio = cfg.get("audio", {})
    voices = {**DEFAULT_VOICES, **audio.get("voices", {})}
    rate = audio.get("rate", DEFAULT_RATE)
    rate_for = lambda lang: rate.get(lang, DEFAULT_RATE) if isinstance(rate, dict) else rate
    say = audio.get("say", {})
    langs = cfg.get("languages", [])
    manifest_path = trail / MANIFEST
    manifest = read_json(manifest_path) if manifest_path.exists() else {"files": {}}
    files: dict = manifest.setdefault("files", {})
    # This run's changes to audio.json, applied to it as it stands when saved: other runs
    # (other languages, at the same time) save theirs to the same file meanwhile.
    made_now: dict[str, dict] = {}
    # Recordings put over a made file, and entries whose file is gone (moved with its folder, or deleted).
    unlist: set[str] = set()

    def save() -> None:
        with manifest_lock(manifest_path):
            current = read_json(manifest_path) if manifest_path.exists() else {"files": {}}
            listed: dict = current.setdefault("files", {})
            listed.update(made_now)
            for key in unlist:
                # Checked against audio.json as it is now: another run may have made the file since.
                f, e = trail / key, listed.get(key)
                if e is not None and (not f.exists() or e.get("bytes") != f.stat().st_size):
                    del listed[key]
            tmp = manifest_path.with_name(manifest_path.name + f".{os.getpid()}.tmp")
            tmp.write_text(json.dumps(current, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                           encoding="utf-8", newline="\n")
            tmp.replace(manifest_path)

    items: list[tuple[int, Path, str]] = []  # (n, folder, title key source)
    items.append((0, trail, "trail.json"))
    stations = trail / "stations"
    for i, d in enumerate(sorted(p for p in stations.iterdir() if p.is_dir()), start=1):
        items.append((i, d, "station.json"))

    run_langs = [lang for lang in langs if not args.lang or lang in args.lang]
    # Keys end in audio.<lang>.mp3. A file listed under a folder's old name is found by its hash.
    unlist |= {k for k in files if k.rsplit(".", 2)[-2] in run_langs and not (trail / k).exists()}
    moved_from = {files[k]["sha"]: k for k in unlist if "sha" in files[k]}

    jobs = []
    for n, folder, meta in items:
        data = read_json(folder / meta) if n else cfg
        titles = data.get("title", {})
        for lang in run_langs:
            # A reading, where the item has one, is spoken in place of the text and its captions.
            reading = folder / f"reading.{lang}.md"
            md_file = reading if reading.exists() else folder / f"text.{lang}.md"
            if not md_file.exists():
                continue
            title = titles.get(lang) or titles.get(langs[0], "")
            md = md_file.read_text(encoding="utf-8")
            out = folder / f"audio.{lang}.mp3"
            key = out.relative_to(trail).as_posix()
            voice = voices.get(lang)
            if not voice:
                sys.exit(f"No voice for language '{lang}': set audio.voices.{lang} in trail.json")
            # A caption the language lacks is left out: the card shows the source language's there.
            caps = [c.strip() for im in data.get("images", []) if (c := (im.get("caption") or {}).get(lang, "")).strip()] \
                if audio.get("captions") and md_file != reading else []
            digest = source_hash(title, md, caps)
            rate_l = rate_for(lang)
            head, body = spoken(n, title, md, lang, say_for(say, lang), caps)
            entry = files.get(key)
            moved = False
            if entry is None and out.exists() and (old := moved_from.get(sha(out.read_bytes()))):
                entry, moved = files[old], True
            size = out.stat().st_size if out.exists() else None
            made = entry is not None and entry.get("bytes") == size
            if out.exists() and not made and not args.overwrite_recordings:
                print(f"  keep   {key} (a recording, not made by this script)")
                if entry is not None:
                    unlist.add(key)
                continue
            same = made and entry.get("voice") == voice and entry.get("rate") == rate_l and not args.force
            keep_head = same and entry.get("head") == sha(head)
            keep_body = same and entry.get("body") == sha(body)
            if keep_head and keep_body:
                print(f"  {'moved ' if moved else 'fresh '} {key}")
                if moved or entry.get("source") != digest:
                    made_now[key] = {**entry, "source": digest}
                continue
            if entry is None or "intro" not in entry:  # where the intro ends isn't known: made again whole
                keep_head = keep_body = False
            intro = entry["intro"] if keep_head or keep_body else 0
            jobs.append((key, out, head, body, voice, rate_l, digest, keep_head, keep_body, intro))

    for key, out, head, body, voice, rate_l, digest, keep_head, keep_body, intro in jobs:
        part = " (intro)" if keep_body else " (after the intro)" if keep_head else ""
        if args.dry_run:
            said = [t for t, kept in ((head, keep_head), (body, keep_body)) if not kept]
            print(f"--- {key}{part} ({voice}, {rate_l})\n" + "\n\n".join(said) + "\n")
            continue
        print(f"  speak  {key}{part} ({voice}) ...", end=" ", flush=True)
        old = out.read_bytes() if keep_head or keep_body else b""
        head_b = old[:intro] if keep_head else trim_intro(await synth(head, voice, rate_l, out))
        body_b = old[intro:] if keep_body else await synth(body, voice, rate_l, out) if body else b""
        mp3 = head_b + body_b
        await write(mp3, out)
        made_now[key] = {"source": digest, "voice": voice, "rate": rate_l, "head": sha(head), "body": sha(body),
                         "intro": len(head_b), "sha": sha(mp3), "bytes": len(mp3)}
        print(f"{len(mp3) // 1024} KB")
        # Saved after each file, so an interrupted run keeps what it made.
        save()
    if (unlist or made_now) and not args.dry_run:
        save()

    print(f"{len(jobs)} file(s) {'to make' if args.dry_run else 'made'}.")


if __name__ == "__main__":
    asyncio.run(main())
