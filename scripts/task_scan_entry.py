import re
import public_task_scan as scan

fallback = scan.numbers_after_time


def metrics(text):
    head = text.split("Гонорар", 1)[0]
    match = re.search(r"Опыт:\s*(?:Не важ(?:ен|на)|До 1 года|1[–-]3 года|От 3 лет)\s+(\d+)\s+(\d+(?:[\u00a0 ]\d{3})*)\s*$", head, re.I)
    if not match:
        return fallback(text)
    return int(match.group(1)), int(re.sub(r"[\u00a0 ]", "", match.group(2)))


scan.numbers_after_time = metrics

if __name__ == "__main__":
    raise SystemExit(scan.main())
