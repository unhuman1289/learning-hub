import type { ReactNode } from "react";

const rustTokens = /(\/\/.*$|"(?:\\.|[^"\\])*"|\b(?:as|async|await|break|const|continue|crate|dyn|else|enum|extern|false|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|Self|self|static|struct|super|trait|true|type|unsafe|use|where|while|Some|None|Ok|Err)\b|\b\d[\d_]*\b)/g;

export function CodeLines({ code, language, highlighted }: { code: string; language: string; highlighted?: number }) {
  return code.split("\n").map((line, index) => <span key={index} className={`block min-h-6 ${highlighted === index + 1 ? "bg-postit-yellow/60" : ""}`}>
    <span className="inline-block w-10 select-none pr-3 text-right text-accent" aria-hidden="true">{index + 1}</span>
    {language === "rust" ? line.split(rustTokens).map((token, i): ReactNode => i % 2 === 0 ? token
      : <span key={i} className={token.startsWith("//") ? "text-muted-paper" : token.startsWith('"') ? "text-ok" : "font-semibold text-accent-paper"}>{token}</span>) : line}
  </span>);
}
