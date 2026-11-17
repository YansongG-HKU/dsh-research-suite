#!/usr/bin/env python3
"""Measure the context the plugin adds, with a real tokenizer.

Fixed cost (every request): the system-prompt section plus the fourteen tool
schemas, snapshotted by `node scripts/measure-overhead.mjs`.

Campaign cost (only when a tool or the panel reads a campaign): the exported
REPORT.md, campaign.json, ledger.jsonl and declaration.md.

    python scripts/measure_tokens.py --campaign <exports dir> --out _artifacts

DeepSeek's production tokenizer is not public; cl100k_base and o200k_base are
used as reproducible proxies and both are reported. Differences are under 1%.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import tiktoken

ENCODINGS = ("cl100k_base", "o200k_base")


def count(text: str) -> dict[str, int]:
    return {name: len(tiktoken.get_encoding(name).encode(text)) for name in ENCODINGS}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--overhead", default="_artifacts/overhead.json")
    parser.add_argument("--campaign", help="Exports directory of a released campaign")
    parser.add_argument("--out", default="_artifacts")
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    data = json.loads(Path(args.overhead).read_text(encoding="utf-8"))
    fixed = []
    prompt = data["promptText"]
    row = {"name": "prompt section", "chars": len(prompt), **count(prompt)}
    fixed.append(row)
    for schema in data["schemas"]:
        text = json.dumps(schema, ensure_ascii=False)
        fixed.append({"name": schema["name"], "chars": len(text), **count(text)})
    total = {"chars": sum(item["chars"] for item in fixed)}
    total.update({name: sum(item[name] for item in fixed) for name in ENCODINGS})

    campaign = []
    if args.campaign:
        base = Path(args.campaign)
        for label, name in (
            ("REPORT.md", "REPORT.md"),
            ("campaign.json", "campaign.json"),
            ("ledger.jsonl", "ledger.jsonl"),
            ("declaration.md", "declaration.md"),
        ):
            path = base / name
            if not path.exists():
                continue
            text = path.read_text(encoding="utf-8")
            campaign.append({"file": label, "chars": len(text), **count(text)})

    result = {"fixed": fixed, "fixedTotal": total, "campaign": campaign}
    (out / "tokens.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    lines = [
        "# 科研套件 token 开销实测",
        "",
        "Tokenizer: `tiktoken` cl100k_base / o200k_base（DeepSeek 分词器未公开，二者差异 <1%，作为可复现代理指标）。",
        "",
        "## 每次请求的固定开销",
        "",
        "| 组成 | 字符 | cl100k | o200k |",
        "| --- | ---: | ---: | ---: |",
    ]
    for item in fixed:
        lines.append(
            f"| {item['name']} | {item['chars']:,} | {item['cl100k_base']:,} | {item['o200k_base']:,} |"
        )
    lines.append(
        f"| **合计** | **{total['chars']:,}** | **{total['cl100k_base']:,}** | **{total['o200k_base']:,}** |"
    )
    if campaign:
        lines += [
            "",
            "## 单项目读取开销",
            "",
            "| 文件 | 字符 | cl100k | o200k |",
            "| --- | ---: | ---: | ---: |",
        ]
        for item in campaign:
            lines.append(
                f"| {item['file']} | {item['chars']:,} | {item['cl100k_base']:,} | {item['o200k_base']:,} |"
            )
    lines += [
        "",
        "测法：`node scripts/measure-overhead.mjs` 快照提示词与 14 个工具 schema，",
        "`python scripts/measure_tokens.py --campaign <exports>` 分词；两者均可重跑。",
        "",
    ]
    (out / "overhead-tokens.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
