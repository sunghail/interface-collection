"""Capture the Adsorption Studio screenshots of this archive entry.

    python capture.py OUT_DIR [BASE_URL] [--probe]       (BASE_URL default http://127.0.0.1:8783)

Run the app's server with its own, empty --userdata folder first (see the entry README), never against a
folder that holds real project data: the script resets that folder's project to the built-in example project
(made-up data) through the app's API, loads the five built-in literature presets through the preset dialog,
then walks the 5-step guide, the 단일 bed views, the 공정 summary and the settings drawer.
--probe prints the visible buttons after each capture (to find selectors after a UI change).
"""
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

args = [a for a in sys.argv[1:] if not a.startswith("--")]
PROBE = "--probe" in sys.argv
OUT = Path(args[0])
BASE = args[1] if len(args) > 1 else "http://127.0.0.1:8783"
OUT.mkdir(parents=True, exist_ok=True)

# the packaged desktop app listens on 18790 with the user's own data: never reset that one
assert ":18790" not in BASE, "this is the desktop app with real data; start a separate server with --userdata"
req = urllib.request.Request(BASE + "/api/project/reset", data=b"{}", headers={"Content-Type": "application/json"})
urllib.request.urlopen(req).read()


def buttons(pg):
    names = pg.eval_on_selector_all("button:visible", "els => els.map(e => e.textContent.trim().replace(/\\s+/g,' ').slice(0,36))")
    return " | ".join(n for n in names if n)


def settle(pg, ms=900):
    pg.wait_for_load_state("networkidle")
    pg.wait_for_timeout(ms)


def shot(pg, name, full=False):
    settle(pg)
    pg.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
    print("shot", name)
    if PROBE:
        print("   buttons:", buttons(pg))


def click(pg, text, exact=False, nth=0):
    pg.get_by_role("button", name=text, exact=exact).nth(nth).click()
    settle(pg, 500)


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=1, locale="ko-KR",
                              timezone_id="Asia/Seoul", color_scheme="light")
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(BASE + "/#guide")
    settle(pg, 2000)

    # preset dialog with the literature presets, then load all five
    click(pg, "📂 프리셋 불러오기")
    shot(pg, "02-preset-library")
    PRESETS = ["Amberlite XAD-4 (Hu 2021 외)", "Amberlite XAD761 (Hu 2021)", "Nuchar 분말 활성탄 (Soleimani 2013)",
               "Sigma 입상 활성탄 20–40 mesh (Jeong 2016)", "약염기 음이온교환수지 335 (Han 2022)"]
    for name in PRESETS:
        # a closed modal stays in the page (aria-hidden=true), so check the attribute, not visibility
        if not pg.locator(".modal[aria-hidden=false] .library").count():
            pg.keyboard.press("Escape")
            settle(pg, 300)
            click(pg, "📂 프리셋 불러오기")
        row = pg.locator(".modal .library .library-item").filter(has_text=name).last
        row.get_by_role("button", name="불러오기").click(timeout=8000)
        settle(pg, 800)
        print("loaded", name)
    pg.keyboard.press("Escape")
    pg.goto(BASE + "/#guide")
    settle(pg, 1500)
    shot(pg, "01-guide-data")

    # the example resin's input form (sampling times, 평형 measurements)
    pg.locator("button", has_text="예시 고분자 수지").first.click()
    shot(pg, "03-adsorbent-form")
    pg.keyboard.press("Escape")
    settle(pg, 300)

    # a help widget
    pg.locator(".help-tip:visible").nth(1).click()
    shot(pg, "04-help-widget")
    pg.keyboard.press("Escape")
    settle(pg, 300)

    click(pg, "다음: 1-2 피팅 확인 →")
    shot(pg, "05-guide-fitting")

    click(pg, "다음: 설계 조건 →")
    pg.get_by_role("button", name="고정층 연속 통액").click()
    settle(pg, 800)
    shot(pg, "06-guide-targets")
    click(pg, "다음: 흡착제 선택 →")
    pg.get_by_role("button", name="선택", exact=True).first.wait_for(timeout=240000)
    settle(pg, 1500)
    shot(pg, "07-guide-choose", full=True)
    pg.get_by_role("button", name="선택", exact=True).first.click()
    settle(pg, 800)
    click(pg, "다음: 결과 →")
    pg.wait_for_function("!document.querySelector('#view').textContent.includes('계산하는 중')", timeout=240000)
    settle(pg, 2000)
    shot(pg, "08-guide-result", full=True)
    click(pg, "다음: 저장 →")
    shot(pg, "09-guide-save")

    # 단일 bed (advanced) views of the chosen adsorbent
    for name, view in [("10-bed-compare", "screen"), ("11-bed-profile-z", "z"), ("12-bed-breakthrough-t", "t")]:
        pg.goto(BASE + f"/#bed/{view}")
        settle(pg, 1500)
        pg.wait_for_function("!document.querySelector('#status').textContent.includes('계산 중')", timeout=240000)
        settle(pg, 1500)
        shot(pg, name)
    pg.goto(BASE + "/#process/summary")
    settle(pg, 1500)
    pg.wait_for_function("!document.querySelector('#status').textContent.includes('계산 중')", timeout=300000)
    settle(pg, 1500)
    shot(pg, "13-process-flowsheet")
    pg.locator("#menu-btn").click()
    pg.get_by_role("menuitem", name="⚙ 모든 설정").click()
    shot(pg, "14-settings")
    print("errors:", errors)
    browser.close()
