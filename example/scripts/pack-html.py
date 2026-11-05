"""Pack an `expo export -p web` build into one self-contained HTML file.

The JS bundle is inlined and the fonts the app loads become data: URIs, so the
file opens by double-click (file://) with no server. Usage:

  EXPO_PUBLIC_SHOWCASE=3d npx expo export -p web --output-dir /tmp/dist
  python3 scripts/pack-html.py /tmp/dist out.html [--font NAME=path.ttf ...]

--font swaps a font file (e.g. a Latin-only subset) for the one whose file
name starts with NAME, to keep the page small.
"""
import base64
import re
import sys
from pathlib import Path

USED_FONTS = ('STIXTwoText_400Regular.', 'STIXTwoText_400Regular_Italic.', 'ZenKakuGothicNew_400Regular.')


def data_uri(path: Path, mime: str) -> str:
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()


def main() -> None:
    dist, out, *rest = sys.argv[1:]
    dist = Path(dist)
    overrides = {}
    for i, a in enumerate(rest):
        if a == '--font':
            k, v = rest[i + 1].split('=', 1)
            overrides[k] = v

    html = (dist / 'index.html').read_text()
    src = re.search(r'<script src="(/_expo/static/js/web/[^"]+)" defer></script>', html)
    js = (dist / src.group(1).lstrip('/')).read_text()

    for ref in sorted(set(re.findall(r'"(/assets/[^"]+\.ttf)"', js))):
        name = ref.rsplit('/', 1)[1]
        if not name.startswith(USED_FONTS):
            continue
        override = next((p for k, p in overrides.items() if name.startswith(k + '.')), None)
        js = js.replace(f'"{ref}"', '"' + data_uri(Path(override) if override else dist / ref.lstrip('/'), 'font/ttf') + '"')

    js = js.replace('</script', '<\\/script').replace('<!--', '<\\!--')
    html = html.replace(src.group(0), '<script>' + js + '</script>')
    html = html.replace('<link rel="icon" href="/favicon.ico"/>', '')
    html = re.sub(r'<title>.*?</title>', '<title>BYE Math Engine · 3D</title>', html)
    Path(out).write_text(html)
    print(f'{out}: {len(html) / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
