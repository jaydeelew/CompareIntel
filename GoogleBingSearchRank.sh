#!/bin/bash

# GoogleBingSearchRank.sh
# Script to check the search ranking of compareintel.com for "compare ai models side by side"
# Uses local Chrome browser via Selenium
#
# USAGE:
#   ./GoogleBingSearchRank.sh
#
#   If encountering issues and to see the browser in action (non-headless mode):
#     HEADLESS_MODE=false ./GoogleBingSearchRank.sh
#
# SETUP:
#   1. Install Python 3
#   2. Install required packages:
#      pip install selenium webdriver-manager
#   3. Chrome browser must be installed
#
# REQUIREMENTS:
#   - Python 3 (required)
#   - selenium package (pip install selenium)
#   - webdriver-manager package (pip install webdriver-manager)
#   - Chrome browser installed
#   - bash (required)

set -e

# Configuration
SEARCH_QUERY="compare ai models side by side"
TARGET_DOMAIN="compareintel.com"
MAX_RESULTS_TO_CHECK=200  # Check up to 100 results (10 pages for Google, ~10 pages for Bing)
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

def search_google(driver, query, max_results=100):
    """Search Google and extract results"""
    results = []
    page = 1
    
    while len(results) < max_results:
        if page == 1:
            url = f"https://www.google.com/search?q={query.replace(' ', '+')}"
        else:
            url = f"https://www.google.com/search?q={query.replace(' ', '+')}&start={(page-1)*10}"
        
        try:
            driver.get(url)
            time.sleep(3)  # Wait for page to load
            
            # Handle cookie consent if present
            try:
                cookie_selectors = [
                    "button:contains('Accept')",
                    "button:contains('I agree')",
                    "button[id*='accept']",
                    "button[id*='L2AGLb']",
                    "#L2AGLb"
                ]
                for selector in ["#L2AGLb", "button#L2AGLb", "button[aria-label*='Accept']"]:
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
            
            page_results = []
            for element in result_elements:
                try:
                    # Try multiple selectors for the link
                    link_elem = None
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
            
            if not page_results:
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
            
            # Check if there's a next page
            try:
                next_button = driver.find_element(By.CSS_SELECTOR, "a#pnnext, a[aria-label='Next']")
                if not next_button:
                    break
            except:
                # Check if we got fewer than 10 results (likely last page)
                if len(unique_results) < 10:
                    break
            
            page += 1
            time.sleep(2)  # Be respectful with delays
            
        except Exception as e:
            print(f"ERROR:Error searching Google page {page}: {e}", file=sys.stderr, flush=True)
            break
    
    return results[:max_results]

def search_bing(driver, query, max_results=100):
    """Search Bing and extract results"""
    results = []
    page = 1
    
    while len(results) < max_results:
        if page == 1:
            url = f"https://www.bing.com/search?q={query.replace(' ', '+')}"
        else:
            url = f"https://www.bing.com/search?q={query.replace(' ', '+')}&first={(page-1)*10+1}"
        
        try:
            driver.get(url)
            time.sleep(3)  # Wait for page to load
            
            # Find search result links
            result_elements = driver.find_elements(By.CSS_SELECTOR, "ol#b_results li.b_algo")
            
            page_results = []
            for element in result_elements:
                try:
                    link_elem = element.find_element(By.CSS_SELECTOR, "h2 a")
                    href = link_elem.get_attribute('href')
                    if href:
                        page_results.append(href)
                except:
                    continue
            
            if not page_results:
                # Try alternative selector
                try:
                    links = driver.find_elements(By.CSS_SELECTOR, "ol#b_results li h2 a")
                    page_results = [link.get_attribute('href') for link in links if link.get_attribute('href')]
                except:
                    pass
            
            if not page_results:
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
            
            # Check if there's a next page
            try:
                next_button = driver.find_element(By.CSS_SELECTOR, "a.sb_pagN, a[title='Next page']")
                if not next_button:
                    break
            except:
                # Check if we got fewer than 10 results (likely last page)
                if len(unique_results) < 10:
                    break
            
            page += 1
            time.sleep(2)  # Be respectful with delays
            
        except Exception as e:
            print(f"ERROR:Error searching Bing page {page}: {e}", file=sys.stderr, flush=True)
            break
    
    return results[:max_results]

def find_domain_position(results, domain):
    """Find the position of domain in results (1-based)"""
    for idx, url in enumerate(results, 1):
        if domain.lower() in url.lower():
            return idx
    return None

def main():
    if len(sys.argv) < 4:
        print("ERROR:Usage: python script.py <query> <domain> <max_results> <headless>", file=sys.stderr, flush=True)
        sys.exit(1)
    
    query = sys.argv[1]
    domain = sys.argv[2]
    max_results = int(sys.argv[3])
    headless = sys.argv[4].lower() == 'true'
    
    driver = None
    try:
        print("SEARCHING_GOOGLE", flush=True)
        driver = setup_chrome_driver(headless=headless)
        
        # Search Google
        google_results = search_google(driver, query, max_results=max_results)
        google_position = find_domain_position(google_results, domain)
        
        if google_position:
            print(f"GOOGLE_RESULT:{google_position}", flush=True)
        else:
            print("GOOGLE_RESULT:NOT_FOUND", flush=True)
        
        # Search Bing
        print("SEARCHING_BING", flush=True)
        bing_results = search_bing(driver, query, max_results=max_results)
        bing_position = find_domain_position(bing_results, domain)
        
        if bing_position:
            print(f"BING_RESULT:{bing_position}", flush=True)
        else:
            print("BING_RESULT:NOT_FOUND", flush=True)
            
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
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Search Ranking Checker (Browser Mode)${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo -e "Query: ${YELLOW}${SEARCH_QUERY}${NC}"
    echo -e "Target Domain: ${YELLOW}${TARGET_DOMAIN}${NC}"
    echo -e "Max Results Checked: ${YELLOW}${MAX_RESULTS_TO_CHECK}${NC}"
    echo -e "Headless Mode: ${YELLOW}${HEADLESS_MODE}${NC}"
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
    python3 "$TEMP_SCRIPT" "$SEARCH_QUERY" "$TARGET_DOMAIN" "$MAX_RESULTS_TO_CHECK" "$HEADLESS_MODE" 2>&1 | while IFS= read -r line; do
        if [[ "$line" == "SEARCHING_GOOGLE" ]]; then
            echo -e "${BLUE}Checking Google search results using Chrome browser...${NC}"
        elif [[ "$line" == GOOGLE_RESULT:* ]]; then
            result="${line#GOOGLE_RESULT:}"
            if [[ "$result" == "NOT_FOUND" ]]; then
                echo -e "${YELLOW}✗ ${TARGET_DOMAIN} not found in the first ${MAX_RESULTS_TO_CHECK} Google search results${NC}"
            else
                echo -e "${GREEN}✓ Found ${TARGET_DOMAIN} at position ${result} in Google search results${NC}"
            fi
        elif [[ "$line" == "SEARCHING_BING" ]]; then
            echo -e "${BLUE}Checking Bing search results using Chrome browser...${NC}"
        elif [[ "$line" == BING_RESULT:* ]]; then
            result="${line#BING_RESULT:}"
            if [[ "$result" == "NOT_FOUND" ]]; then
                echo -e "${YELLOW}✗ ${TARGET_DOMAIN} not found in the first ${MAX_RESULTS_TO_CHECK} Bing search results${NC}"
            else
                echo -e "${GREEN}✓ Found ${TARGET_DOMAIN} at position ${result} in Bing search results${NC}"
            fi
        elif [[ "$line" == ERROR:* ]]; then
            echo -e "${RED}Error: ${line#ERROR:}${NC}" >&2
        fi
    done
    
    # Cleanup
    rm -f "$TEMP_SCRIPT"
    
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Search complete${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Run main function
main "$@"
