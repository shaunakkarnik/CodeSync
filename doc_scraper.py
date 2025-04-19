from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup

def scrape():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("https://developer.apple.com/documentation/swiftui/view-deprecated", wait_until="networkidle")

        # Extract the raw HTML
        html = page.content()
        browser.close()

    # Parse the HTML with BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")

    # Find all elements containing deprecated functions (usually inside <code> tags)
    deprecated_functions = [code.text.strip() for code in soup.find_all("code") if "func" in code.text]

    # Print results
    for func in deprecated_functions:
        print(func)

scrape()
