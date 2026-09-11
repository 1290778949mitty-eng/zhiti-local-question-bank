/** XML 1.0 characters only. Preserve tabs, line breaks and astral Unicode;
 * make unrecognizable input visible without emitting an unreadable DOCX. */
export function xmlSafeText(value:string):string {
  return Array.from(value,char=>{
    const n=char.codePointAt(0)!;
    return n===9||n===10||n===13||n>=0x20&&n<=0xD7FF||n>=0xE000&&n<=0xFFFD||n>=0x10000&&n<=0x10FFFF?char:'�';
  }).join('');
}
