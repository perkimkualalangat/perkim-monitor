#!/usr/bin/env python3
"""Semakan statik repo website PERKIM dan output JSON berstruktur.

Guna:
    python tools/check_static.py --site ../perkim-web --out data/.static.json
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

IMAGE_SUFFIXES = {
    ".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg",
}
TEXT_SUFFIXES = {
    ".html", ".htm", ".css", ".js", ".mjs", ".json", ".md",
    ".yml", ".yaml", ".py", ".bat", ".txt",
}
VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}
SKIP_PARTS = {".git", "node_modules", "__pycache__", ".venv", "venv"}
SKIP_URL_PREFIXES = (
    "http://", "https://", "//", "mailto:", "tel:", "data:",
    "javascript:", "blob:", "#",
)
SENSITIVE_PATTERNS = [
    ("GitHub PAT klasik", re.compile(r"ghp_[A-Za-z0-9]{30,}")),
    ("GitHub PAT halus", re.compile(r"github_pat_[A-Za-z0-9_]{20,}")),
    ("AWS access key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("Private key", re.compile(r"-----BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY-----")),
]
CSS_IMPORT = re.compile(r'@import\s+(?:url\()?["\']([^"\')]+)["\']')
CSS_URL = re.compile(r'url\(([^)]+)\)', re.IGNORECASE)


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def status_rank(status: str) -> int:
    return {"unknown": 0, "pass": 1, "warn": 2, "fail": 3}.get(status, 0)


def worst(statuses: list[str]) -> str:
    if not statuses:
        return "unknown"
    return max(statuses, key=status_rank)


def make_check(
    check_id: str,
    label: str,
    status: str,
    category: str,
    detail: str = "",
    items: list[dict] | None = None,
) -> dict:
    return {
        "id": check_id,
        "label": label,
        "status": status,
        "category": category,
        "detail": detail,
        "items": items or [],
    }


class PageParser(HTMLParser):
    """Parser ringkas untuk metadata, pautan, imej dan struktur HTML."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, int]] = []
        self.problems: list[str] = []
        self.lang: str | None = None
        self.title: str = ""
        self._in_title = False
        self.meta: dict[str, str] = {}
        self.links: list[dict] = []
        self.images: list[dict] = []
        self.h1: list[str] = []
        self._in_h1 = False
        self.headings: list[str] = []
        self.ids: list[str] = []
        self.blank_targets: list[str] = []
        self.controls: list[dict] = []
        self.labels_for: set[str] = set()

    def handle_starttag(self, tag: str, attrs) -> None:
        attrs = dict(attrs)
        line = self.getpos()[0]

        if tag == "html":
            self.lang = attrs.get("lang")
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            name = (attrs.get("name") or attrs.get("property") or "").strip().lower()
            if name:
                self.meta[name] = attrs.get("content", "")
        elif tag == "link":
            rel = (attrs.get("rel") or "").lower()
            if "stylesheet" in rel or "canonical" in rel or "icon" in rel:
                self.links.append({
                    "tag": tag,
                    "attr": "href",
                    "value": attrs.get("href", ""),
                    "line": line,
                    "rel": rel,
                })
        elif tag == "a":
            self.links.append({
                "tag": tag,
                "attr": "href",
                "value": attrs.get("href", ""),
                "line": line,
                "rel": (attrs.get("rel") or "").lower(),
                "target": (attrs.get("target") or "").lower(),
            })
            if (attrs.get("target") or "").lower() == "_blank":
                rel = (attrs.get("rel") or "").lower()
                if "noopener" not in rel and "noreferrer" not in rel:
                    self.blank_targets.append(attrs.get("href", ""))
        elif tag == "img":
            src = attrs.get("src", "")
            self.images.append({
                "src": src,
                "alt": attrs.get("alt"),
                "aria_hidden": attrs.get("aria-hidden"),
                "role": attrs.get("role"),
                "line": line,
            })
            if src:
                self.links.append({
                    "tag": tag,
                    "attr": "src",
                    "value": src,
                    "line": line,
                })
        elif tag in {"script", "iframe", "embed", "video", "audio"}:
            value = attrs.get("src", "")
            if value:
                self.links.append({
                    "tag": tag,
                    "attr": "src",
                    "value": value,
                    "line": line,
                })
        elif tag == "source":
            value = attrs.get("src", "")
            if value:
                self.links.append({
                    "tag": tag,
                    "attr": "src",
                    "value": value,
                    "line": line,
                })
        elif tag == "label":
            target = attrs.get("for")
            if target:
                self.labels_for.add(target)
        elif tag in {"input", "select", "textarea"}:
            control_type = (attrs.get("type") or "").lower()
            if tag == "input" and control_type in {"hidden", "submit", "button", "reset", "image"}:
                pass
            else:
                self.controls.append({
                    "tag": tag,
                    "type": control_type,
                    "id": attrs.get("id"),
                    "aria_label": attrs.get("aria-label"),
                    "aria_labelledby": attrs.get("aria-labelledby"),
                    "title": attrs.get("title"),
                    "line": line,
                })

        if tag == "h1":
            self._in_h1 = True
            self.h1.append("")
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self.headings.append(tag)
        if "id" in attrs and attrs["id"]:
            self.ids.append(attrs["id"])

        if tag not in VOID:
            self.stack.append((tag, line))

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        if tag == "h1":
            self._in_h1 = False
        if tag in VOID:
            return

        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                for inner, line in self.stack[index + 1:]:
                    self.problems.append(
                        f"<{inner}> dibuka baris {line} tetapi tidak ditutup sebelum </{tag}>"
                    )
                del self.stack[index:]
                return
        self.problems.append(f"</{tag}> tanpa pembuka")

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
        if self._in_h1 and self.h1:
            self.h1[-1] += data


def resolve_target(site: Path, source: Path, raw: str) -> tuple[Path | None, str | None]:
    """Pulangkan (path, ralat). None bermaksud bukan fail tempatan."""
    value = (raw or "").strip()
    if not value or value.startswith(SKIP_URL_PREFIXES):
        return None, None

    parsed = urlparse(value)
    if parsed.scheme or parsed.netloc:
        return None, None

    path_part = unquote(parsed.path)
    if not path_part:
        return None, None

    if path_part.startswith("/"):
        target = site / path_part.lstrip("/")
    else:
        target = source.parent / path_part

    try:
        target = target.resolve()
        target.relative_to(site.resolve())
    except (ValueError, OSError):
        return None, "Pautan keluar dari folder laman"

    if path_part.endswith("/"):
        target = target / "index.html"
    return target, None


def run_tool(site: Path, script: str, args: list[str] | None = None) -> dict:
    script_path = site / "tools" / script
    if not script_path.exists():
        return {
            "ok": False,
            "missing": True,
            "code": None,
            "stdout": "",
            "stderr": f"Skrip {script} tidak ditemui.",
        }
    try:
        result = subprocess.run(
            [sys.executable, str(script_path), *(args or [])],
            cwd=str(site),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
            check=False,
        )
        return {
            "ok": result.returncode == 0,
            "missing": False,
            "code": result.returncode,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
        }
    except Exception as exc:  # noqa: BLE001 - laporan audit perlu terus berjalan
        return {
            "ok": False,
            "missing": False,
            "code": None,
            "stdout": "",
            "stderr": str(exc),
        }


def discover_files(site: Path) -> list[Path]:
    files: list[Path] = []
    for path in site.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_PARTS for part in path.parts):
            continue
        relative = path.relative_to(site).as_posix()
        # Halaman eksperimen dan alat tempatan tidak dipantau sebagai halaman awam.
        if relative.startswith("dev/"):
            continue
        if relative == "pages/tetapan.html":
            continue
        files.append(path)
    return files


def scan_sensitive(site: Path, files: list[Path]) -> list[dict]:
    findings: list[dict] = []
    for path in files:
        if path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if path.stat().st_size > 2 * 1024 * 1024:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for line_number, line in enumerate(text.splitlines(), 1):
            for label, pattern in SENSITIVE_PATTERNS:
                if pattern.search(line):
                    findings.append({
                        "fail": path.relative_to(site).as_posix(),
                        "baris": line_number,
                        "jenis": label,
                    })
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", required=True, help="Folder repo website")
    parser.add_argument("--phase", default="draf", choices=["draf", "live"], help="Fasa laman")
    parser.add_argument("--out", default="", help="Fail JSON output")
    parser.add_argument("--image-kb", type=int, default=500, help="Ambang saiz gambar (KB)")
    args = parser.parse_args()

    site = Path(args.site).resolve()
    if not site.is_dir():
        print(f"Folder site tidak ditemui: {site}", file=sys.stderr)
        return 2

    files = discover_files(site)
    html_files = sorted(path for path in files if path.suffix.lower() in {".html", ".htm"})
    css_files = sorted(path for path in files if path.suffix.lower() == ".css")
    json_files = sorted(path for path in files if path.suffix.lower() == ".json")
    image_files = sorted(path for path in files if path.suffix.lower() in IMAGE_SUFFIXES)

    checks: list[dict] = []
    pages: list[dict] = []
    missing_assets: list[dict] = []

    html_issues: dict[str, list[dict]] = {
        "html": [], "lang": [], "title": [], "description": [], "viewport": [],
        "robots": [], "h1": [], "alt": [], "links": [], "seo": [], "a11y": [],
    }

    for path in html_files:
        relative = path.relative_to(site).as_posix()
        text = path.read_text(encoding="utf-8", errors="replace")
        page = PageParser()
        try:
            page.feed(text)
            page.close()
        except Exception as exc:  # noqa: BLE001
            html_issues["html"].append({"fail": relative, "mesej": f"Parser gagal: {exc}"})
            continue

        issues: list[dict] = []
        for problem in page.problems:
            issues.append({"severity": "fail", "mesej": problem})
            html_issues["html"].append({"fail": relative, "mesej": problem})

        lang = (page.lang or "").strip().lower()
        if lang != "ms":
            message = f"lang=\"{page.lang or ''}\" (sepatutnya ms)"
            issues.append({"severity": "warn", "mesej": message})
            html_issues["lang"].append({"fail": relative, "mesej": message})

        title = " ".join(page.title.split())
        if not title:
            message = "Tiada <title>"
            issues.append({"severity": "fail", "mesej": message})
            html_issues["title"].append({"fail": relative, "mesej": message})
        elif not 10 <= len(title) <= 70:
            message = f"Panjang title {len(title)} aksara"
            issues.append({"severity": "warn", "mesej": message})
            html_issues["title"].append({"fail": relative, "mesej": message})

        description = (page.meta.get("description") or "").strip()
        if not description:
            message = "Tiada meta description"
            issues.append({"severity": "warn", "mesej": message})
            html_issues["description"].append({"fail": relative, "mesej": message})
        elif not 50 <= len(description) <= 170:
            message = f"Panjang description {len(description)} aksara"
            issues.append({"severity": "warn", "mesej": message})
            html_issues["description"].append({"fail": relative, "mesej": message})

        if "viewport" not in page.meta:
            message = "Tiada meta viewport"
            issues.append({"severity": "warn", "mesej": message})
            html_issues["viewport"].append({"fail": relative, "mesej": message})

        robots = (page.meta.get("robots") or "").lower()
        noindex = "noindex" in robots
        if args.phase == "draf" and not noindex:
            message = "Fasa draf tetapi tiada noindex"
            issues.append({"severity": "warn", "mesej": message})
            html_issues["robots"].append({"fail": relative, "mesej": message})
        elif args.phase == "live" and noindex:
            message = "Fasa live tetapi masih noindex"
            issues.append({"severity": "warn", "mesej": message})
            html_issues["robots"].append({"fail": relative, "mesej": message})

        h1_count = len([item for item in page.h1 if item.strip()])
        if h1_count == 0:
            message = "Tiada H1"
            issues.append({"severity": "fail", "mesej": message})
            html_issues["h1"].append({"fail": relative, "mesej": message})
        elif h1_count > 1:
            message = f"{h1_count} H1 dijumpai"
            issues.append({"severity": "warn", "mesej": message})
            html_issues["h1"].append({"fail": relative, "mesej": message})

        missing_alt = 0
        empty_alt = 0
        for image in page.images:
            if image["alt"] is None:
                missing_alt += 1
            elif not image["alt"].strip():
                empty_alt += 1
        if missing_alt:
            message = f"{missing_alt} imej tiada atribut alt"
            issues.append({"severity": "fail", "mesej": message})
            html_issues["alt"].append({"fail": relative, "mesej": message})
        if empty_alt:
            message = f"{empty_alt} imej alt kosong (dekoratif?)"
            issues.append({"severity": "warn", "mesej": message})
            html_issues["alt"].append({"fail": relative, "mesej": message})

        if "canonical" not in page.meta and not any(
            link.get("rel") == "canonical" for link in page.links
        ):
            message = "Tiada canonical"
            issues.append({"severity": "warn", "mesej": message})
            html_issues["seo"].append({"fail": relative, "mesej": message})
        if not page.meta.get("og:title"):
            message = "Tiada og:title"
            issues.append({"severity": "warn", "mesej": message})
            html_issues["seo"].append({"fail": relative, "mesej": message})
        if not page.meta.get("og:description"):
            message = "Tiada og:description"
            issues.append({"severity": "warn", "mesej": message})
            html_issues["seo"].append({"fail": relative, "mesej": message})

        if "skip-link" not in text and 'href="#main"' not in text:
            message = "Tiada skip link"
            issues.append({"severity": "warn", "mesej": message})
            html_issues["a11y"].append({"fail": relative, "mesej": message})
        if page.blank_targets:
            message = f"{len(page.blank_targets)} pautan target=_blank tanpa noopener"
            issues.append({"severity": "warn", "mesej": message})
            html_issues["a11y"].append({"fail": relative, "mesej": message})
        duplicates = sorted({item for item in page.ids if page.ids.count(item) > 1})
        if duplicates:
            message = f"ID berganda: {', '.join(duplicates[:5])}"
            issues.append({"severity": "warn", "mesej": message})
            html_issues["a11y"].append({"fail": relative, "mesej": message})
        unlabeled = [
            control for control in page.controls
            if not control["aria_label"]
            and not control["aria_labelledby"]
            and not control["title"]
            and (not control["id"] or control["id"] not in page.labels_for)
        ]
        if unlabeled:
            message = f"{len(unlabeled)} kawalan borang tanpa label"
            issues.append({"severity": "warn", "mesej": message})
            html_issues["a11y"].append({"fail": relative, "mesej": message})

        internal_links = 0
        external_links = 0
        for link in page.links:
            value = (link.get("value") or "").strip()
            if not value:
                continue
            if value.startswith(("http://", "https://", "//")):
                external_links += 1
                continue
            target, error = resolve_target(site, path, value)
            if error:
                missing_assets.append({
                    "fail": relative,
                    "baris": link.get("line"),
                    "pautan": value,
                    "mesej": error,
                })
                continue
            if target is None:
                continue
            internal_links += 1
            if not target.exists():
                missing_assets.append({
                    "fail": relative,
                    "baris": link.get("line"),
                    "pautan": value,
                    "mesej": f"Fail tidak ditemui: {target.relative_to(site).as_posix()}",
                })

        if missing_assets:
            page_missing = [item for item in missing_assets if item["fail"] == relative]
            if page_missing:
                issues.append({
                    "severity": "fail",
                    "mesej": f"{len(page_missing)} pautan/aset tidak ditemui",
                })

        pages.append({
            "path": relative,
            "title": title,
            "description": description,
            "lang": page.lang,
            "robots": robots,
            "noindex": noindex,
            "h1": h1_count,
            "headings": page.headings,
            "images": len(page.images),
            "missing_alt": missing_alt,
            "empty_alt": empty_alt,
            "internal_links": internal_links,
            "external_links": external_links,
            "bytes": path.stat().st_size,
            "issues": issues,
        })

    # CSS imports dan url()
    css_missing: list[dict] = []
    for path in css_files:
        relative = path.relative_to(site).as_posix()
        text = path.read_text(encoding="utf-8", errors="replace")
        values = [(match, "import") for match in CSS_IMPORT.findall(text)]
        values += [(match.strip().strip("'\""), "url") for match in CSS_URL.findall(text)]
        for value, kind in values:
            if not value or value.startswith(SKIP_URL_PREFIXES):
                continue
            target, error = resolve_target(site, path, value)
            if error:
                css_missing.append({
                    "fail": relative,
                    "pautan": value,
                    "mesej": error,
                })
            elif target is not None and not target.exists():
                css_missing.append({
                    "fail": relative,
                    "pautan": value,
                    "mesej": f"Fail tidak ditemui: {target.relative_to(site).as_posix()}",
                })

    # JSON
    json_errors: list[dict] = []
    json_summary: list[dict] = []
    for path in json_files:
        relative = path.relative_to(site).as_posix()
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                count = len(data)
            elif isinstance(data, dict):
                count = len(data)
            else:
                count = 1
            json_summary.append({
                "fail": relative,
                "entri": count,
                "saiz": path.stat().st_size,
            })
        except Exception as exc:  # noqa: BLE001
            json_errors.append({"fail": relative, "mesej": str(exc)})

    # Program
    program_source = run_tool(site, "bina_aktiviti.py", ["--semak"])
    program_data = run_tool(site, "check-aktiviti.py")
    programs: dict = {
        "total": 0,
        "sorotan": 0,
        "draf": 0,
        "gambar": 0,
        "alt_missing": 0,
        "items": [],
    }
    program_issues: list[dict] = []
    sorotan_issues: list[dict] = []
    activity_path = site / "data" / "aktiviti.json"
    if activity_path.exists():
        try:
            records = json.loads(activity_path.read_text(encoding="utf-8"))
            if not isinstance(records, list):
                raise ValueError("data/aktiviti.json bukan array")
            sorotan_seen: dict[int, list[str]] = {}
            for record in records:
                if not isinstance(record, dict):
                    continue
                gallery = record.get("gambar") or []
                if not isinstance(gallery, list):
                    gallery = []
                images: list[dict] = []
                missing_alt = 0
                missing_files = 0
                for image in gallery:
                    if not isinstance(image, dict):
                        continue
                    src = str(image.get("src") or "")
                    alt = str(image.get("alt") or "").strip()
                    exists = bool(src) and (site / src).exists()
                    if not alt:
                        missing_alt += 1
                    if not exists:
                        missing_files += 1
                    images.append({
                        "src": src,
                        "alt": alt,
                        "kapsyen": image.get("kapsyen"),
                        "exists": exists,
                    })
                sorotan = record.get("sorotan")
                if isinstance(sorotan, int) and not isinstance(sorotan, bool) and sorotan > 0:
                    programs["sorotan"] += 1
                    sorotan_seen.setdefault(sorotan, []).append(str(record.get("id") or ""))
                status = str(record.get("status") or "")
                if status == "draf":
                    programs["draf"] += 1
                programs["total"] += 1
                programs["gambar"] += len(gallery)
                programs["alt_missing"] += missing_alt
                item_issues: list[dict] = []
                if missing_alt:
                    item_issues.append({
                        "severity": "fail",
                        "mesej": f"{missing_alt} gambar tiada alt",
                    })
                    program_issues.append({
                        "program": record.get("id"),
                        "mesej": f"{missing_alt} gambar tiada alt",
                    })
                if missing_files:
                    item_issues.append({
                        "severity": "fail",
                        "mesej": f"{missing_files} fail gambar tidak ditemui",
                    })
                    program_issues.append({
                        "program": record.get("id"),
                        "mesej": f"{missing_files} fail gambar tidak ditemui",
                    })
                if not gallery:
                    item_issues.append({
                        "severity": "warn",
                        "mesej": "Tiada gambar",
                    })
                programs["items"].append({
                    "id": record.get("id"),
                    "slug": record.get("slug"),
                    "tajuk": record.get("tajuk"),
                    "tarikh": record.get("tarikh"),
                    "kategori": record.get("kategori"),
                    "status": status,
                    "sorotan": sorotan if isinstance(sorotan, int) and not isinstance(sorotan, bool) else None,
                    "gambar": len(gallery),
                    "alt_missing": missing_alt,
                    "missing_files": missing_files,
                    "issues": item_issues,
                    "images": images,
                })
            for number, ids in sorotan_seen.items():
                if len(ids) > 1:
                    sorotan_issues.append({
                        "sorotan": number,
                        "program": ids,
                        "mesej": f"Sorotan {number} digunakan oleh {len(ids)} program",
                    })
        except Exception as exc:  # noqa: BLE001
            program_issues.append({"program": "-", "mesej": f"Gagal baca aktiviti.json: {exc}"})

    # Gambar besar
    large_images: list[dict] = []
    for path in image_files:
        size = path.stat().st_size
        if size > args.image_kb * 1024:
            large_images.append({
                "fail": path.relative_to(site).as_posix(),
                "kb": round(size / 1024, 1),
            })

    # Fail sementara
    temp_files = [
        path.relative_to(site).as_posix()
        for path in files
        if path.suffix.lower() in {".bak", ".tmp", ".orig"} or path.name.endswith("~")
    ]

    sensitive = scan_sensitive(site, files)

    # Bina checks
    def page_check(check_id: str, label: str, category: str, key: str) -> dict:
        items = html_issues[key]
        if not items:
            return make_check(check_id, label, "pass", category, "Tiada isu", [])
        statuses = []
        for _item in items:
            statuses.append("fail" if key in {"html", "h1", "alt", "links"} else "warn")
        return make_check(
            check_id,
            label,
            worst(statuses),
            category,
            f"{len(items)} isu",
            items[:200],
        )

    checks.extend([
        page_check("static.html", "Struktur HTML seimbang", "teknikal", "html"),
        page_check("static.lang", "Atribut bahasa ms", "a11y", "lang"),
        page_check("static.title", "Tajuk halaman", "seo", "title"),
        page_check("static.description", "Meta description", "seo", "description"),
        page_check("static.viewport", "Meta viewport", "teknikal", "viewport"),
        page_check("static.robots", "Arahan robots", "seo", "robots"),
        page_check("static.h1", "Satu H1 setiap halaman", "a11y", "h1"),
        page_check("static.alt", "Alt text imej", "a11y", "alt"),
        page_check("static.seo", "Canonical dan Open Graph", "seo", "seo"),
        page_check("static.a11y", "Skip link, label dan pautan selamat", "a11y", "a11y"),
    ])

    checks.append(make_check(
        "static.links",
        "Pautan dan aset tempatan",
        "fail" if missing_assets else "pass",
        "pautan",
        f"{len(missing_assets)} pautan/aset tidak ditemui" if missing_assets else "Semua pautan/aset ditemui",
        missing_assets[:200],
    ))
    checks.append(make_check(
        "static.css",
        "Import dan url() CSS",
        "fail" if css_missing else "pass",
        "pautan",
        f"{len(css_missing)} rujukan CSS tidak ditemui" if css_missing else "Semua rujukan CSS ditemui",
        css_missing[:200],
    ))
    checks.append(make_check(
        "static.json",
        "Fail JSON sah",
        "fail" if json_errors else "pass",
        "data",
        f"{len(json_errors)} fail JSON rosak" if json_errors else f"{len(json_summary)} fail JSON sah",
        json_errors[:200],
    ))
    checks.append(make_check(
        "static.program",
        "Sumber program dan data aktiviti",
        "fail" if (not program_source["ok"] or not program_data["ok"] or program_issues) else "pass",
        "data",
        "Semakan sumber program dan data aktiviti",
        [
            *([{"mesej": "bina_aktiviti.py --semak", "output": program_source["stdout"] or program_source["stderr"]}] if not program_source["ok"] else []),
            *([{"mesej": "check-aktiviti.py", "output": program_data["stdout"] or program_data["stderr"]}] if not program_data["ok"] else []),
            *program_issues,
        ][:200],
    ))
    checks.append(make_check(
        "static.sorotan",
        "Nombor sorotan unik",
        "fail" if sorotan_issues else "pass",
        "data",
        f"{len(sorotan_issues)} konflik sorotan" if sorotan_issues else "Semua nombor sorotan unik",
        sorotan_issues,
    ))
    checks.append(make_check(
        "static.large_images",
        "Saiz gambar",
        "warn" if large_images else "pass",
        "prestasi",
        f"{len(large_images)} gambar melebihi {args.image_kb} KB" if large_images else f"Semua gambar bawah {args.image_kb} KB",
        large_images[:200],
    ))
    checks.append(make_check(
        "static.temp_files",
        "Fail sementara",
        "warn" if temp_files else "pass",
        "teknikal",
        f"{len(temp_files)} fail .bak/.tmp" if temp_files else "Tiada fail sementara",
        [{"fail": item} for item in temp_files[:200]],
    ))
    checks.append(make_check(
        "static.sensitive",
        "Tiada token atau kunci dalam repo",
        "fail" if sensitive else "pass",
        "keselamatan",
        f"{len(sensitive)} penemuan sensitif" if sensitive else "Tiada penemuan sensitif",
        sensitive[:200],
    ))

    summary = {
        "pass": sum(1 for check in checks if check["status"] == "pass"),
        "warn": sum(1 for check in checks if check["status"] == "warn"),
        "fail": sum(1 for check in checks if check["status"] == "fail"),
        "unknown": sum(1 for check in checks if check["status"] == "unknown"),
        "checks": len(checks),
        "pages": len(pages),
        "json_files": len(json_summary),
        "images": len(image_files),
    }

    result = {
        "generated_at": iso_now(),
        "site_root": str(site),
        "phase": args.phase,
        "summary": summary,
        "checks": checks,
        "pages": pages,
        "programs": programs,
        "json_files": json_summary,
        "missing_assets": missing_assets,
        "large_images": large_images,
        "temp_files": temp_files,
        "sensitive": sensitive,
        "tools": {
            "bina_aktiviti": program_source,
            "check_aktiviti": program_data,
        },
    }

    output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(output, encoding="utf-8")
    else:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
