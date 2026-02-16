#!/usr/bin/env python3
"""Check search ranking of a domain for a query using Chrome/Selenium on Google and Bing."""

import sys
import re
import time
import base64
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager


def setup_chrome_driver(headless=True):
    chrome_options = Options()
    if headless:
        chrome_options.add_argument('--headless')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--disable-blink-features=AutomationControlled')
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)
    chrome_options.add_argument(
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )
    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=chrome_options)


def _normalize_domain(domain):
    if not domain:
        return None
    return domain.lower().replace('https://', '').replace('http://', '').replace('www.', '').strip('/')


def search_google(driver, query, domain=None):
    results = []
    page = 1
    normalized_domain = _normalize_domain(domain)
    while True:
        url = f"https://www.google.com/search?q={query.replace(' ', '+')}" + (
            f"&start={(page-1)*10}" if page > 1 else ""
        )
        try:
            driver.get(url)
            time.sleep(3)
            page_text = driver.page_source.lower()
            if 'captcha' in page_text or 'unusual traffic' in page_text or 'automated queries' in page_text:
                print("ERROR:Google blocking detected. Try HEADLESS_MODE=false.", file=sys.stderr, flush=True)
                break
            if 'did not match any documents' in page_text or 'no results found' in page_text:
                break
            try:
                for sel in ["#L2AGLb", "button#L2AGLb", "button[aria-label*='Accept']"]:
                    try:
                        btn = WebDriverWait(driver, 2).until(EC.element_to_be_clickable((By.CSS_SELECTOR, sel)))
                        btn.click()
                        time.sleep(1)
                        break
                    except Exception:
                        continue
            except Exception:
                pass
            result_elements = driver.find_elements(By.CSS_SELECTOR, "div.g, div.tF2Cxc")
            page_results = []
            for el in result_elements:
                try:
                    for sel in ["a[href^='http']", "h3 a", "a"]:
                        for link in el.find_elements(By.CSS_SELECTOR, sel):
                            href = link.get_attribute('href')
                            if href and href.startswith('http') and 'google.com' not in href:
                                page_results.append(href)
                                break
                        if page_results and page_results[-1]:
                            break
                except Exception:
                    continue
            if not page_results:
                for link in driver.find_elements(By.CSS_SELECTOR, "div.g a[href^='http']"):
                    href = link.get_attribute('href')
                    if href and 'google.com' not in href and href not in page_results:
                        page_results.append(href)
            if not page_results:
                break
            seen = set()
            unique = [u for u in page_results if u not in seen and not seen.add(u)][:10]
            results.extend(unique)
            if normalized_domain:
                for idx, url in enumerate(results, 1):
                    if normalized_domain in url.lower():
                        return results, idx
            has_next = False
            for sel in ["a#pnnext", "a[aria-label='Next']", "a[href*='start=']"]:
                try:
                    nb = driver.find_element(By.CSS_SELECTOR, sel)
                    if nb.is_displayed():
                        href = nb.get_attribute('href')
                        if href and 'start=' in href:
                            has_next = True
                            break
                except Exception:
                    continue
            if not has_next and (len(unique) <= 2 or (page > 1 and len(unique) < 10)):
                break
            page += 1
            time.sleep(2)
        except Exception as e:
            print(f"ERROR:Google page {page}: {e}", file=sys.stderr, flush=True)
            break
    return results, None


def search_bing(driver, query, domain=None):
    results = []
    page = 1
    normalized_domain = _normalize_domain(domain)
    while True:
        url = f"https://www.bing.com/search?q={query.replace(' ', '+')}" + (
            f"&first={(page-1)*10+1}" if page > 1 else ""
        )
        try:
            driver.get(url)
            time.sleep(3)
            result_elements = driver.find_elements(By.CSS_SELECTOR, "ol#b_results li.b_algo")
            page_results = []
            for el in result_elements:
                try:
                    link = el.find_element(By.CSS_SELECTOR, "h2 a")
                    href = link.get_attribute('href')
                    if href and 'bing.com/ck/a' in href and 'u=' in href:
                        m = re.search(r'[&?]u=([^&]+)', href)
                        if m:
                            try:
                                enc = m.group(1)
                                pad = 4 - len(enc) % 4
                                if pad != 4:
                                    enc += '=' * pad
                                href = base64.b64decode(enc).decode('utf-8')
                            except Exception:
                                continue
                    if href and href.startswith('http') and 'bing.com' not in href:
                        page_results.append(href)
                except Exception:
                    continue
            if not page_results:
                for link in driver.find_elements(By.CSS_SELECTOR, "ol#b_results li h2 a"):
                    href = link.get_attribute('href')
                    if href and 'bing.com/ck/a' in href and 'u=' in href:
                        m = re.search(r'[&?]u=([^&]+)', href)
                        if m:
                            try:
                                enc = m.group(1)
                                pad = 4 - len(enc) % 4
                                if pad != 4:
                                    enc += '=' * pad
                                href = base64.b64decode(enc).decode('utf-8')
                            except Exception:
                                continue
                    if href and href.startswith('http') and 'bing.com' not in href:
                        page_results.append(href)
            if not page_results:
                break
            seen = set()
            unique = [u for u in page_results if u not in seen and not seen.add(u)][:10]
            results.extend(unique)
            if normalized_domain:
                for idx, url in enumerate(results, 1):
                    if normalized_domain in url.lower():
                        return results, idx
            try:
                driver.find_element(By.CSS_SELECTOR, "a.sb_pagN, a[title='Next page']")
            except Exception:
                if len(unique) < 10:
                    break
            page += 1
            time.sleep(2)
        except Exception as e:
            print(f"ERROR:Bing page {page}: {e}", file=sys.stderr, flush=True)
            break
    return results, None


def main():
    if len(sys.argv) < 3:
        print("ERROR:Usage: python search_rank_checker.py <query> <domain> [headless]", file=sys.stderr, flush=True)
        sys.exit(1)
    query = sys.argv[1]
    domain = sys.argv[2]
    headless = sys.argv[3].lower() == 'true' if len(sys.argv) > 3 else True
    driver = None
    try:
        print("SEARCHING_GOOGLE", flush=True)
        driver = setup_chrome_driver(headless=headless)
        google_results, google_pos = search_google(driver, query, domain=domain)
        print(f"GOOGLE_RESULT:{google_pos}" if google_pos else "GOOGLE_RESULT:NOT_FOUND", flush=True)
        print("SEARCHING_BING", flush=True)
        bing_results, bing_pos = search_bing(driver, query, domain=domain)
        print(f"BING_RESULT:{bing_pos}" if bing_pos else "BING_RESULT:NOT_FOUND", flush=True)
    except Exception as e:
        print(f"ERROR:{e}", file=sys.stderr, flush=True)
        sys.exit(1)
    finally:
        if driver:
            driver.quit()


if __name__ == "__main__":
    main()
