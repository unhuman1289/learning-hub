const subscripts='₀₁₂₃₄₅₆₇₈₉';
export const isChemistryNotebook=(title:string)=>/(^|\s)(hóa|hoá|chemistry)(\s|$)/iu.test(title);
export const isChemicalFormula=(text:string)=>/^(?:[A-Z][a-z]?\d*|\((?:[A-Z][a-z]?\d*)+\)\d*)+$/.test(text);
/** Presentation only: submitted values and letter case remain unchanged. Ionic
 * charge notation is deliberately left literal rather than guessing subscripts. */
export function formatChemicalText(text:string){return text.replace(/(?<![A-Za-z])(?:[A-Z][a-z]?\d*|\((?:[A-Z][a-z]?\d*)+\)\d*)+\b/g,(token,offset)=>{
 if(/[+-]/.test(text.slice(offset+token.length,offset+token.length+1)))return token;
 return token.replace(/(?<=[A-Za-z)])\d+/g,n=>[...n].map(d=>subscripts[Number(d)]).join(''));
});}

export const plainChemicalText=(text:string)=>text.replace(/[₀₁₂₃₄₅₆₇₈₉]/g,d=>String(subscripts.indexOf(d)));
