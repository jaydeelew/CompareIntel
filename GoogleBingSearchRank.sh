#!/bin/bash
# Checks search ranking of compareintel.com for "compare ai models side by side" using Chrome/Selenium.
# Usage: ./GoogleBingSearchRank.sh  (or HEADLESS_MODE=false for visible browser)

set -e

# Configuration
SEARCH_QUERY="compare ai models side by side"
TARGET_DOMAIN="compareintel.com"
HEADLESS_MODE="${HEADLESS_MODE:-true}"  # Set to false to see browser in action

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Python is available
command -v python3 >/dev/null 2>&1 || { echo -e "${RED}Error: python3 is required but not installed.${NC}" >&2; exit 1; }

# Create Python script inline
PYTHON_SCRIPT=$(cat <<'PYTHON_EOF'
import sys
import json
import time
import urllib.parse
import base64
import re
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options

def setup_chrome_driver(headless=True):
    """Setup Chrome driver with options"""
    chrome_options = Options()
    if headless:
        chrome_options.add_argument('--headless')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--disable-blink-features=AutomationControlled')
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)
    chrome_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    return driver

def search_google(driver, query, domain=None):
    """Search Google and extract results until domain is found or no more results"""
    results = []
    page = 1
    normalized_domain = None
    if domain:
        normalized_domain = domain.lower().replace('https://', '').replace('http://', '').replace('www.', '').strip('/')
    
    while True:
        if page == 1:
            url = f"https://www.google.com/search?q={query.replace(' ', '+')}"
        else:
            url = f"https://www.google.com/search?q={query.replace(' ', '+')}&start={(page-1)*10}"
        
        try:
            driver.get(url)
            time.sleep(3)  # Wait for page to load
            
            # Check for CAPTCHA or blocking
            page_text = driver.page_source.lower()
            if 'captcha' in page_text or 'unusual traffic' in page_text or 'automated queries' in page_text or 'our systems have detected' in page_text:
                print(f"DEBUG:Google may be blocking automated access (CAPTCHA/blocking detected on page {page})", flush=True)
                print(f"ERROR:Google blocking detected. Try running with HEADLESS_MODE=false to see what's happening.", file=sys.stderr, flush=True)
                break
            
            # Check for "no more results" or "end of results" messages
            if 'did not match any documents' in page_text or 'no results found' in page_text:
                print(f"DEBUG:Google indicates no more results on page {page}", flush=True)
                break
            
            # Handle cookie consent if present
            try:
                for selector in ["#L2AGLb", "button#L2AGLb", "button[aria-label*='Accept']", "button[id*='L2AGLb']"]:
                    try:
                        cookie_button = WebDriverWait(driver, 2).until(
                            EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
                        )
                        cookie_button.click()
                        time.sleep(1)
                        break
                    except:
                        continue
            except:
                pass
            
            # Find search result links
            # Google results are typically in divs with class 'g' or 'tF2Cxc'
            result_elements = driver.find_elements(By.CSS_SELECTOR, "div.g, div.tF2Cxc")
            
            # DEBUG: Print how many result elements found
            print(f"DEBUG:Google page {page}: Found {len(result_elements)} result elements", flush=True)
            
            page_results = []
            for element in result_elements:
                try:
                    # Try multiple selectors for the link
                    for selector in ["a[href^='http']", "h3 a", "a"]:
                        try:
                            link_elems = element.find_elements(By.CSS_SELECTOR, selector)
                            for link in link_elems:
                                href = link.get_attribute('href')
                                if href and href.startswith('http') and 'google.com' not in href:
                                    page_results.append(href)
                                    break
                            if page_results and page_results[-1]:
                                break
                        except:
                            continue
                except:
                    continue
            
            if not page_results:
                # Try alternative selector - get all links from results
                try:
                    links = driver.find_elements(By.CSS_SELECTOR, "div.g a[href^='http']")
                    for link in links:
                        href = link.get_attribute('href')
                        if href and 'google.com' not in href and href not in page_results:
                            page_results.append(href)
                except:
                    pass
            
            # DEBUG: Print URLs found on this page
            print(f"DEBUG:Google page {page}: Extracted {len(page_results)} URLs", flush=True)
            if page == 1 and page_results:
                print(f"DEBUG:First few URLs: {page_results[:3]}", flush=True)
            
            if not page_results:
                print(f"DEBUG:No results found on Google page {page}, stopping", flush=True)
                break  # No more results
            
            # Remove duplicates and limit to 10 per page
            seen = set()
            unique_results = []
            for url in page_results:
                if url not in seen:
                    seen.add(url)
                    unique_results.append(url)
                    if len(unique_results) >= 10:
                        break
            
            results.extend(unique_results)
            print(f"DEBUG:Google total results so far: {len(results)}", flush=True)
            
            # Check if target domain is found in results
            if normalized_domain:
                for idx, url in enumerate(results, 1):
                    normalized_url = url.lower()
                    if normalized_domain in normalized_url:
                        print(f"DEBUG:Found target domain at position {idx}, stopping search", flush=True)
                        return results, idx
            
            # Check if there's a next page - try multiple selectors
            has_next_page = False
            next_button = None
            
            # Try multiple selectors for the next button
            next_selectors = [
                "a#pnnext",
                "a[aria-label='Next']",
                "a[aria-label='Next page']",
                "td[style*='text-align:left'] a",
                "#pnnext",
                "a[href*='start=']"
            ]
            
            for selector in next_selectors:
                try:
                    next_button = driver.find_element(By.CSS_SELECTOR, selector)
                    # Check if it's actually a next button (not disabled)
                    if next_button and next_button.is_displayed():
                        href = next_button.get_attribute('href')
                        if href and ('start=' in href or 'next' in href.lower()):
                            has_next_page = True
                            break
                except:
                    continue
            
            # Also check page source for next page indicators
            if not has_next_page:
                page_source = driver.page_source.lower()
                # Look for next page indicators in the HTML
                if 'pnnext' in page_source or 'next' in page_source or f'start={(page)*10}' in page_source:
                    # Try to find any link with the next start parameter
                    try:
                        next_links = driver.find_elements(By.CSS_SELECTOR, f"a[href*='start={(page)*10}']")
                        if next_links:
                            has_next_page = True
                    except:
                        pass
            
            # If we got fewer than 10 results, we might be at the end, but try one more page
            # to be sure (Google sometimes shows fewer results on the last page)
            if not has_next_page:
                if len(unique_results) < 10:
                    # If we got very few results (0-2), definitely stop
                    if len(unique_results) <= 2:
                        print(f"DEBUG:Got {len(unique_results)} results on Google page {page}, stopping (likely last page)", flush=True)
                        break
                    # If we got 3-9 results, try one more page to be sure
                    if page > 1:  # Don't stop on first page
                        print(f"DEBUG:Got {len(unique_results)} results on Google page {page}, trying one more page to confirm", flush=True)
                        # Continue to next iteration to check
                else:
                    print(f"DEBUG:No next button found and got {len(unique_results)} results, stopping", flush=True)
                    break
            else:
                print(f"DEBUG:Next page button found, continuing", flush=True)
            
            page += 1
            time.sleep(2)  # Be respectful with delays
            
        except Exception as e:
            print(f"ERROR:Error searching Google page {page}: {e}", file=sys.stderr, flush=True)
            break
    
    print(f"DEBUG:Final Google results count: {len(results)}", flush=True)
    return results, None

def search_bing(driver, query, domain=None):
    """Search Bing and extract results until domain is found or no more results"""
    results = []
    page = 1
    normalized_domain = None
    if domain:
        normalized_domain = domain.lower().replace('https://', '').replace('http://', '').replace('www.', '').strip('/')
    
    while True:
        if page == 1:
            url = f"https://www.bing.com/search?q={query.replace(' ', '+')}"
        else:
            url = f"https://www.bing.com/search?q={query.replace(' ', '+')}&first={(page-1)*10+1}"
        
        try:
            driver.get(url)
            time.sleep(3)  # Wait for page to load
            
            # Find search result links
            result_elements = driver.find_elements(By.CSS_SELECTOR, "ol#b_results li.b_algo")
            
            # DEBUG: Print how many result elements found
            print(f"DEBUG:Bing page {page}: Found {len(result_elements)} result elements", flush=True)
            
            page_results = []
            for element in result_elements:
                try:
                    link_elem = element.find_element(By.CSS_SELECTOR, "h2 a")
                    href = link_elem.get_attribute('href')
                    if href:
                        # Bing uses redirect URLs - extract the actual destination URL
                        # Redirect URLs look like: bing.com/ck/a?!&&p=...&u=a1aHR0cHM6Ly9...
                        # The 'u' parameter contains base64-encoded actual URL
                        if 'bing.com/ck/a' in href and 'u=' in href:
                            # Extract the 'u' parameter using regex (more reliable for this format)
                            match = re.search(r'[&?]u=([^&]+)', href)
                            if match:
                                try:
                                    # The 'u' parameter is base64 encoded
                                    encoded_url = match.group(1)
                                    # Add padding if needed
                                    padding = 4 - len(encoded_url) % 4
                                    if padding != 4:
                                        encoded_url += '=' * padding
                                    decoded = base64.b64decode(encoded_url).decode('utf-8')
                                    href = decoded
                                except Exception as e:
                                    # If decoding fails, skip this URL
                                    continue
                        # Also try getting the href attribute which might have the real URL
                        try:
                            # Sometimes the actual URL is in a data-attribute
                            data_url = link_elem.get_attribute('data-url') or link_elem.get_attribute('data-href')
                            if data_url and data_url.startswith('http'):
                                href = data_url
                        except:
                            pass
                        if href and not href.startswith('bing.com') and href.startswith('http'):
                            page_results.append(href)
                except:
                    continue
            
            if not page_results:
                # Try alternative selector
                try:
                    links = driver.find_elements(By.CSS_SELECTOR, "ol#b_results li h2 a")
                    for link in links:
                        href = link.get_attribute('href')
                        if href:
                            # Handle Bing redirect URLs
                            if 'bing.com/ck/a' in href and 'u=' in href:
                                match = re.search(r'[&?]u=([^&]+)', href)
                                if match:
                                    try:
                                        encoded_url = match.group(1)
                                        padding = 4 - len(encoded_url) % 4
                                        if padding != 4:
                                            encoded_url += '=' * padding
                                        decoded = base64.b64decode(encoded_url).decode('utf-8')
                                        href = decoded
                                    except:
                                        continue
                            if href and not href.startswith('bing.com') and href.startswith('http'):
                                page_results.append(href)
                except:
                    pass
            
            # DEBUG: Print URLs found on this page
            print(f"DEBUG:Bing page {page}: Extracted {len(page_results)} URLs", flush=True)
            if page == 1 and page_results:
                print(f"DEBUG:First few URLs: {page_results[:3]}", flush=True)
            
            if not page_results:
                print(f"DEBUG:No results found on Bing page {page}, stopping", flush=True)
                break  # No more results
            
            # Remove duplicates and limit to 10 per page
            seen = set()
            unique_results = []
            for url in page_results:
                if url not in seen:
                    seen.add(url)
                    unique_results.append(url)
                    if len(unique_results) >= 10:
                        break
            
            results.extend(unique_results)
            print(f"DEBUG:Bing total results so far: {len(results)}", flush=True)
            
            # Check if target domain is found in results
            if normalized_domain:
                for idx, url in enumerate(results, 1):
                    normalized_url = url.lower()
                    if normalized_domain in normalized_url:
                        print(f"DEBUG:Found target domain at position {idx}, stopping search", flush=True)
                        return results, idx
            
            # Check if there's a next page
            try:
                next_button = driver.find_element(By.CSS_SELECTOR, "a.sb_pagN, a[title='Next page']")
                if not next_button:
                    print(f"DEBUG:No next button found on Bing page {page}, stopping", flush=True)
                    break
            except:
                # Check if we got fewer than 10 results (likely last page)
                if len(unique_results) < 10:
                    print(f"DEBUG:Got fewer than 10 results on Bing page {page}, likely last page", flush=True)
                    break
            
            page += 1
            time.sleep(2)  # Be respectful with delays
            
        except Exception as e:
            print(f"ERROR:Error searching Bing page {page}: {e}", file=sys.stderr, flush=True)
            break
    
    print(f"DEBUG:Final Bing results count: {len(results)}", flush=True)
    return results, None

def find_domain_position(results, domain):
    """Find the position of domain in results (1-based)"""
    # Normalize domain - remove protocol and www if present
    normalized_domain = domain.lower().replace('https://', '').replace('http://', '').replace('www.', '').strip('/')
    
    for idx, url in enumerate(results, 1):
        # Normalize URL for comparison
        normalized_url = url.lower()
        # Check if domain matches (with or without www, http/https)
        if normalized_domain in normalized_url:
            return idx
    return None

def main():
    if len(sys.argv) < 3:
        print("ERROR:Usage: python script.py <query> <domain> <headless>", file=sys.stderr, flush=True)
        sys.exit(1)
    
    query = sys.argv[1]
    domain = sys.argv[2]
    headless = sys.argv[3].lower() == 'true' if len(sys.argv) > 3 else True
    
    driver = None
    try:
        print("SEARCHING_GOOGLE", flush=True)
        driver = setup_chrome_driver(headless=headless)
        
        # Search Google - will stop when domain is found or no more results
        google_results, google_position = search_google(driver, query, domain=domain)
        print(f"DEBUG:Total Google URLs found: {len(google_results)}", flush=True)
        
        if google_position:
            print(f"GOOGLE_RESULT:{google_position}", flush=True)
        else:
            print("GOOGLE_RESULT:NOT_FOUND", flush=True)
            # Show sample URLs for debugging
            if google_results:
                print(f"DEBUG:Sample Google URLs (first 5): {google_results[:5]}", flush=True)
        
        # Search Bing - will stop when domain is found or no more results
        print("SEARCHING_BING", flush=True)
        bing_results, bing_position = search_bing(driver, query, domain=domain)
        print(f"DEBUG:Total Bing URLs found: {len(bing_results)}", flush=True)
        
        if bing_position:
            print(f"BING_RESULT:{bing_position}", flush=True)
        else:
            print("BING_RESULT:NOT_FOUND", flush=True)
            # Show sample URLs for debugging
            if bing_results:
                print(f"DEBUG:Sample Bing URLs (first 5): {bing_results[:5]}", flush=True)
            
    except Exception as e:
        print(f"ERROR:{str(e)}", file=sys.stderr, flush=True)
        sys.exit(1)
    finally:
        if driver:
            driver.quit()

if __name__ == "__main__":
    main()
PYTHON_EOF
)

# Main execution
main() {
    echo -e "Search ranking: ${YELLOW}${SEARCH_QUERY}${NC} → ${TARGET_DOMAIN} (headless=${HEADLESS_MODE})"
    echo ""
    
    # Check if selenium is installed
    if ! python3 -c "import selenium" 2>/dev/null; then
        echo -e "${RED}Error: selenium package is not installed.${NC}" >&2
        echo -e "${YELLOW}Install it with: pip install selenium webdriver-manager${NC}" >&2
        exit 1
    fi
    
    # Check if webdriver_manager is installed
    if ! python3 -c "from webdriver_manager.chrome import ChromeDriverManager" 2>/dev/null; then
        echo -e "${RED}Error: webdriver-manager package is not installed.${NC}" >&2
        echo -e "${YELLOW}Install it with: pip install webdriver-manager${NC}" >&2
        exit 1
    fi
    
    # Create temporary Python script
    TEMP_SCRIPT=$(mktemp)
    echo "$PYTHON_SCRIPT" > "$TEMP_SCRIPT"
    
    # Run Python script and capture output
    python3 "$TEMP_SCRIPT" "$SEARCH_QUERY" "$TARGET_DOMAIN" "$HEADLESS_MODE" 2>&1 | while IFS= read -r line; do
        if [[ "$line" == "SEARCHING_GOOGLE" ]]; then
            echo -e "${BLUE}Checking Google search results using Chrome browser...${NC}"
        elif [[ "$line" == DEBUG:* ]]; then
            # Show debug output in a muted color
            echo -e "${BLUE}[DEBUG]${NC} ${line#DEBUG:}"
        elif [[ "$line" == GOOGLE_RESULT:* ]]; then
            result="${line#GOOGLE_RESULT:}"
            if [[ "$result" == "NOT_FOUND" ]]; then
                echo -e "${YELLOW}✗ ${TARGET_DOMAIN} not found in Google search results (searched all available results)${NC}"
            else
                echo -e "${GREEN}✓ Found ${TARGET_DOMAIN} at position ${result} in Google search results${NC}"
            fi
        elif [[ "$line" == "SEARCHING_BING" ]]; then
            echo -e "${BLUE}Checking Bing search results using Chrome browser...${NC}"
        elif [[ "$line" == BING_RESULT:* ]]; then
            result="${line#BING_RESULT:}"
            if [[ "$result" == "NOT_FOUND" ]]; then
                echo -e "${YELLOW}✗ ${TARGET_DOMAIN} not found in Bing search results (searched all available results)${NC}"
            else
                echo -e "${GREEN}✓ Found ${TARGET_DOMAIN} at position ${result} in Bing search results${NC}"
            fi
        elif [[ "$line" == ERROR:* ]]; then
            echo -e "${RED}Error: ${line#ERROR:}${NC}" >&2
        fi
    done
    
    rm -f "$TEMP_SCRIPT"
    echo ""
}

# Run main function
main "$@"
