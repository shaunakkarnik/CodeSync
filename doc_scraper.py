from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
import json
import re
import time
import random

def scrape_deprecated_functions():
    deprecated_functions = []
    
    with sync_playwright() as p:
        # Open browser with user agent
        # This is better aligned with robots.txt
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Documentation Helper Tool"
        )
        page = context.new_page()
        
        # Visits page that has the deprecated modifiers modi
        print("Accessing deprecated modifiers page...")
        page.goto("https://developer.apple.com/documentation/swiftui/view-deprecated", wait_until="networkidle")
        # Delay so servers aren't overloaded
        time.sleep(2)
        
        list_html = page.content()
        
        # Parse HTML
        soup = BeautifulSoup(list_html, "html.parser")
        
        # Finds all deprecated function links
        function_links = []
        links = soup.select("a.link.deprecated")
        
        for link in links:
            href = link.get('href')
            if href:
                # Extract function name
                code_element = link.select_one("code.decorated-title")
                if code_element:
                    # Get all text without tags for the function name
                    function_name = code_element.text.strip()
                    
                    function_links.append({
                        "name": function_name,
                        "url": "https://developer.apple.com" + href if not href.startswith('http') else href
                    })
        
        print(f"Found {len(function_links)} deprecated functions to process")
        
        # Visit each detailed page for the function to get the "use ___ instead part"
        for idx, function in enumerate(function_links):
            try:
                print(f"\nProcessing {idx+1}/{len(function_links)}: {function['name']}")
                
                page.goto(function['url'], wait_until="networkidle")

                time.sleep(1.5 + random.random())
                
                detail_html = page.content()
                detail_soup = BeautifulSoup(detail_html, "html.parser")
                
                # Using the selector that worked in the test function
                selectors = [
                    "aside.deprecated .content p",
                    "div.deprecated-notice p", 
                    ".deprecation-notice p",
                    "div.content p:contains('Use')",
                    "p:contains('deprecated')"
                ]
                
                replacement_function = ""
                description = ""
                
                # Try each selector until we find something
                for selector in selectors:
                    elements = detail_soup.select(selector)
                    for element in elements:
                        text = element.text.strip()
                        if "deprecated" in text.lower() or "use" in text.lower():
                            description = text
                            
                            # Try to find the replacement in a code tag
                            code_element = element.find("code")
                            if code_element:
                                replacement_function = code_element.text.strip()
                            else:
                                # Try to extract with regex
                                match = re.search(r'Use\s+([^\s\.]+)', description)
                                if match:
                                    replacement_function = match.group(1)
                            
                            if replacement_function:
                                break
                    
                    if replacement_function:
                        break
                
                # Add the extracted information
                result = {
                    "deprecated": function['name'],
                    "replacement": replacement_function,
                    "description": description
                }
                
                print(f"  → Found replacement: {replacement_function or 'None'}")
                print(f"  → Description: {description or 'None'}")
                
                deprecated_functions.append(result)
                    
            except Exception as e:
                print(f"Error processing {function['name']}: {str(e)}")
                # Don't overwhelm the server even on error
                time.sleep(1)
                
                # Still add the function with error note
                deprecated_functions.append({
                    "deprecated": function['name'],
                    "replacement": "",
                    "description": f"Error extracting data: {str(e)}"
                })
        
        browser.close()
    
    # Save to JSON file 
    with open('deprecated_functions.json', 'w') as f:
        json.dump(deprecated_functions, f, indent=2)
    
    print(f"\nSuccessfully extracted {len(deprecated_functions)} deprecated functions with replacements")
    return deprecated_functions

def test_single_function(url="https://developer.apple.com/documentation/swiftui/view/accessibility(label:)"):
    """Test scraping just one function to verify extraction logic works."""
    print(f"Testing extraction on: {url}")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="CodeSync-Bot/1.0 (Documentation Helper Tool)"
        )
        page = context.new_page()
        
        # Navigate to the function's detail page
        page.goto(url, wait_until="networkidle")
        detail_html = page.content()
        detail_soup = BeautifulSoup(detail_html, "html.parser")
        
        # Try multiple selectors to find the deprecation notice
        selectors = [
            "aside.deprecated .content p",
            "div.deprecated-notice p", 
            ".deprecation-notice p",
            "div.content p:contains('Use')",
            "p:contains('deprecated')"
        ]
        
        replacement_function = ""
        description = ""
        
        # Try each selector until we find something
        for selector in selectors:
            elements = detail_soup.select(selector)
            for element in elements:
                text = element.text.strip()
                if "deprecated" in text.lower() or "use" in text.lower():
                    description = text
                    print(f"Found description with selector '{selector}': {description}")
                    
                    # Try to find the replacement in a code tag
                    code_element = element.find("code")
                    if code_element:
                        replacement_function = code_element.text.strip()
                        print(f"Found replacement in code tag: {replacement_function}")
                    else:
                        # Try to extract with regex
                        match = re.search(r'Use\s+([^\s\.]+)', description)
                        if match:
                            replacement_function = match.group(1)
                            print(f"Found replacement with regex: {replacement_function}")
                    
                    if replacement_function:
                        break
            
            if replacement_function:
                break
        
        browser.close()
    
    result = {
        "deprecated": url.split("/")[-1],
        "replacement": replacement_function,
        "description": description
    }
    
    print("\nExtracted result:")
    print(json.dumps(result, indent=2))
    
    return result

if __name__ == "__main__":
    # test_result = test_single_function()
    
    functions = scrape_deprecated_functions()