"""Clean screenshots of Reactor Studio for the archive (no callouts), taken with Edge through Playwright.

Start the studio first (it needs its Python backend), then run this script:
    python reactor_studio/server.py --port 8780 --no-browser
    python capture.py [output-folder]                 # default: ../../screenshots

REACTOR_STUDIO_URL overrides the address (default http://127.0.0.1:8780/).
The browser context is fresh, so every shot starts from the program's default conditions.
"""

import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = os.environ.get("REACTOR_STUDIO_URL", "http://127.0.0.1:8780/")
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "screenshots"
W, H = 1440, 900


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1, locale="ko-KR")
        page.on("dialog", lambda d: d.accept())

        def idle(timeout=90000):
            page.wait_for_function(
                "document.querySelector('#status')?.textContent === '최신' && !document.querySelector('#view .spinner')",
                timeout=timeout)
            page.wait_for_timeout(700)

        def click(selector, text=None):
            loc = page.locator(selector)
            if text:
                loc = loc.filter(has_text=text)
            loc.first.click()
            page.wait_for_timeout(300)

        def shot(name, height=H, clip=None):
            page.set_viewport_size({"width": W, "height": height})
            page.wait_for_timeout(500)
            page.screenshot(path=str(OUT / f"{name}.png"), clip=clip)
            page.set_viewport_size({"width": W, "height": H})
            print("shot", name)

        page.goto(URL)
        page.evaluate("localStorage.clear()")
        page.goto(URL + "#process/summary")
        page.reload()
        page.add_style_tag(content=".drawer:not(.open){display:none!important}")
        idle()

        # 공정 요약: flowsheet, reactor table, composition along the train
        shot("01-process-summary", 1300)

        # property sheet with a number editor open
        click(".prop[data-name=t_stage1_c] .prop-row")
        shot("02-property-editor")
        click(".prop[data-name=t_stage1_c] .prop-row")

        # ⚙ 모든 설정 drawer
        click(".settings-btn")
        click("#settings .settings-tabs button", "속도식")
        shot("03-settings-drawer")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)

        # 단일 bed (CaO): profiles along z, then the start-up in t
        click(".mode-toggle button[data-mode=bed]")
        idle()
        shot("04-single-bed-z")
        click("#viewbar-left button", "시간별 t")
        idle()
        shot("05-single-bed-t")

        # 비누화 ON: catalyst lifetime and outlet Ca
        click("#soap-box .switch")
        idle(timeout=240000)
        click("#viewbar-left button", "위치별 z")
        idle()
        shot("06-saponification", 1250)
        click("#soap-box .switch")
        idle()

        # acid bed that cannot reach the target (water equilibrium)
        click(".kind-pick button", "산촉매")
        page.wait_for_function("['오류', '최신'].includes(document.querySelector('#status')?.textContent)", timeout=60000)
        page.wait_for_timeout(700)
        shot("07-acid-limit")

        # 속도 피팅 with the bundled synthetic CSV
        click(".kind-pick button", "CaO")
        idle()
        click("#viewbar-left button", "속도 피팅")
        page.wait_for_selector(".fit-controls select option[value='example_cao_batch.csv']", state="attached", timeout=20000)
        page.select_option(".fit-controls select", "example_cao_batch.csv")
        page.wait_for_function("document.querySelector('.fit-controls textarea').value.length > 50")
        click(".fit-controls .btn.primary")
        page.wait_for_selector(".fit-result", timeout=60000)
        page.wait_for_timeout(700)
        shot("08-rate-fitting", 1260)

        # 공정 › 직접 구성 (train table)
        click(".mode-toggle button[data-mode=process]")
        idle()
        click(".design-mode button", "직접 구성")
        idle()
        shot("09-custom-train", 1130)
        click(".design-mode button", "자동 설계")
        idle()

        # 판정 기준 with 비누화 so every row has a value
        click("#viewbar-left button", "판정 기준")
        idle()
        click("#soap-box .switch")
        idle(timeout=240000)
        shot("10-criteria", 1080)
        click("#soap-box .switch")
        idle()

        # 시나리오 비교 with two saved variants
        click("#viewbar-left button", "시나리오 비교")
        page.wait_for_selector(".scenarios input.text")

        def save(name):
            page.fill(".scenarios input.text", name)
            click(".scenarios .btn.primary", "저장")

        def set_prop(name, value):
            click(f".prop[data-name={name}] .prop-row")
            page.fill(".prop-editor input.num", str(value))
            page.wait_for_timeout(300)
            click(f".prop[data-name={name}] .prop-row")

        set_prop("ffa_wt", 3)
        save("FFA 3 %")
        click("#changes .link-btn", "모두 되돌리기")
        set_prop("t_stage2_c", 55)
        save("CaO bed 55 °C")
        click("#changes .link-btn", "모두 되돌리기")
        idle()
        for name in ("FFA 3 %", "CaO bed 55 °C"):
            page.locator(".scenario-list li", has_text=name).locator("input[type=checkbox]").check()
            page.wait_for_timeout(300)
        page.wait_for_selector("table.compare", timeout=60000)
        page.wait_for_timeout(900)
        shot("11-scenario-compare", 1300)

        # 최적화 (default goal and budget)
        click("#viewbar-left button", "최적화")
        page.wait_for_selector(".opt-run-btn")
        click(".opt-run-btn")
        page.wait_for_selector(".opt-result", timeout=180000)
        page.wait_for_timeout(700)
        shot("12-optimize", 1030)

        # 한 변수씩 바꿔 보기
        click("#view .subhead .segmented button", "한 변수씩")
        click(".sweep-controls .btn.primary")
        page.wait_for_selector("#view .chart-grid.three", timeout=120000)
        page.wait_for_timeout(900)
        shot("13-sweep", 1010)

        browser.close()


if __name__ == "__main__":
    sys.exit(main())
