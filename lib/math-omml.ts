import { normalizeMathNotation } from './math-notation.mjs';
import { xmlSafeText } from './xml-text';

const escape = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const symbols:Record<string,string> = {
  times:'×',div:'÷',cdot:'·',pm:'±',mp:'∓',le:'≤',leq:'≤',leqslant:'≤',ge:'≥',geq:'≥',geqslant:'≥',
  ne:'≠',neq:'≠',approx:'≈',angle:'∠',triangle:'△',pi:'π',Delta:'Δ',delta:'δ',alpha:'α',beta:'β',gamma:'γ',theta:'θ',
  infty:'∞',therefore:'∴',because:'∵',circ:'°',sim:'∽',backsim:'∽',cong:'≌',perp:'⊥',bot:'⊥',parallel:'∥',
  cdots:'⋯',ldots:'…',vdots:'⋮',dots:'⋯',quad:'　',qquad:'　　',odot:'⊙',bigodot:'⨀',equiv:'≡',cup:'∪',
  Leftrightarrow:'⇔',Rightarrow:'⇒',rightarrow:'→',uparrow:'↑',downarrow:'↓',Uparrow:'⇑',Downarrow:'⇓',
  square:'□',parallelogram:'▱',phi:'ϕ',varphi:'φ',in:'∈',notin:'∉',cap:'∩',to:'→',
};
const functions = new Set(['sin','cos','tan','cot','sec','csc','log','ln','exp','min','max']);
const superscripts:Record<string,string> = {'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','⁺':'+','⁻':'−'};
type Style = 'p'|'i'|'b'|'double-struck';
// Unicode letters retain their double-struck identity in Word importers that
// ignore m:scr. Keep native math runs; never rasterize a set symbol.
function doubleStruck(text:string) {
  const exceptions:Record<string,string>={C:'\u2102',H:'\u210D',N:'\u2115',P:'\u2119',Q:'\u211A',R:'\u211D',Z:'\u2124'};
  return Array.from(text,c=>exceptions[c]||(/^[A-Z]$/.test(c)?String.fromCodePoint(0x1D538+c.charCodeAt(0)-65):/^[a-z]$/.test(c)?String.fromCodePoint(0x1D552+c.charCodeAt(0)-97):/^[0-9]$/.test(c)?String.fromCodePoint(0x1D7D8+c.charCodeAt(0)-48):c)).join('');
}
const run = (s:string,style?:Style) => `<m:r><m:rPr>${style==='double-struck'?'<m:scr m:val="double-struck"/>':''}<m:sty m:val="${style==='double-struck'?'p':/[0-9]/.test(s)?'p':style??(/^[A-Za-zα-ωΑ-Ω]+$/.test(s)?'i':'p')}"/></m:rPr><m:t xml:space="preserve">${escape(style==='double-struck'?doubleStruck(s):s)}</m:t></m:r>`;
const wrap = (name:string,inner:string) => `<m:${name}>${inner}</m:${name}>`;
const delimiter = (body:string,begin:string,end:string) => wrap('d',`<m:dPr><m:begChr m:val="${escape(begin)}"/><m:endChr m:val="${escape(end)}"/></m:dPr>${wrap('e',body)}`);

/** Strict native OMML: unsupported notation fails instead of leaking command names. */
export function mathOmml(source:string):string {
  if(xmlSafeText(source)!==source)throw new Error('公式含异常控制字符，请对照原件校正');
  const text:string=normalizeMathNotation(source).replace(/\*\*/g,'^').replace(/（/g,'(').replace(/）/g,')').replace(/＝/g,'=').replace(/＋/g,'+').replace(/－/g,'−').replace(/＜/g,'<').replace(/＞/g,'>');
  let i=0;
  const skip=()=>{while(i<text.length&&/\s/.test(text[i]))i++;};
  function rawGroup():string {
    skip(); if(text[i++]!=='{')throw new Error('公式缺少分组花括号');
    const start=i;let depth=1;
    while(i<text.length){const c=text[i++];if(c==='{')depth++;if(c==='}'&&!--depth)return text.slice(start,i-1);}
    throw new Error('公式花括号未闭合');
  }
  function group(style?:Style):string {
    skip();if(i>=text.length)throw new Error('公式缺少分子、分母或上下标');
    if(text[i]==='{'){i++;return sequence('}',style);}
    return atom(style);
  }
  function command(style?:Style):string {
    i++;const name=text.slice(i).match(/^[A-Za-z]+/)?.[0]??text[i]??'';i+=name.length;
    if(!name)throw new Error('公式反斜杠命令缺少名称');
    if(['left','right'].includes(name)){if(text[i]==='.')i++;return '';}
    if([',',';',':',' ','!'].includes(name))return name==='!'?'':run(' ');
    if(['{','}','%','#','&','_','$','\\'].includes(name))return run(name,style);
    if(['text','textrm'].includes(name))return run(rawGroup(),'p');
    if(['mathrm','operatorname'].includes(name))return group('p');
    if(name==='mathit')return group('i');
    if(name==='mathbf')return group('b');
    if(name==='mathbb')return group('double-struck');
    if(name==='boldsymbol'){
      // OCR may drop the braces from a one-token bold vector command. Keep
      // that token bold and editable instead of leaking "boldsymbol" text.
      skip();
      return text[i]==='{'?group('b'):text[i]==='\\'?command('b'):atom('b');
    }
    if(name==='lim'){
      skip();const base=run('lim','p');
      if(text[i]!=='_')return base;
      i++;return wrap('limLow',wrap('e',base)+wrap('lim',group(style)));
    }
    // Preserve invisible alignment content as native Word math, including its
    // dimensions. Dropping the command would expose hidden repeated symbols.
    if(['phantom','hphantom','vphantom'].includes(name)) {
      const dimensions=name==='hphantom'?'<m:zeroAsc m:val="1"/><m:zeroDesc m:val="1"/>':name==='vphantom'?'<m:zeroWid m:val="1"/>':'';
      return wrap('phant',`<m:phantPr><m:show m:val="0"/>${dimensions}</m:phantPr>${wrap('e',group(style))}`);
    }
    if(['frac','dfrac','tfrac'].includes(name))return wrap('f',wrap('num',group(style))+wrap('den',group(style)));
    if(name==='sqrt'){
      skip();let degree='';if(text[i]==='['){i++;degree=sequence(']',style);}
      return wrap('rad',`<m:radPr><m:degHide m:val="${degree?'0':'1'}"/></m:radPr>${wrap('deg',degree)}${wrap('e',group(style))}`);
    }
    if(['widehat','hat','overparen','overgroup'].includes(name))return wrap('acc',`<m:accPr><m:chr m:val="${name==='overparen'?'⏜':name==='overgroup'?'⏠':'̂'}"/></m:accPr>${wrap('e',group(style))}`);
    if(['underline','overline'].includes(name))return wrap('bar',`<m:barPr><m:pos m:val="${name==='underline'?'bot':'top'}"/></m:barPr>${wrap('e',group(style))}`);
    if(name==='sout')return wrap('borderBox',`<m:borderBoxPr><m:hideTop m:val="1"/><m:hideBot m:val="1"/><m:hideLeft m:val="1"/><m:hideRight m:val="1"/><m:strikeH m:val="1"/></m:borderBoxPr>${wrap('e',group(style))}`);
    if(name==='xlongequal')return wrap('limUpp',wrap('e',run('='))+wrap('lim',group(style)));
    if(name==='mkern'){
      const spacing=text.slice(i).match(/^-?\d+(?:\.\d+)?mu/);if(!spacing)throw new Error('公式间距命令无效');i+=spacing[0].length;return '';
    }
    if(name==='begin'){
      const env=rawGroup();if(env!=='cases'&&env!=='aligned')throw new Error(`公式暂不支持环境 ${env}`);
      const closing=`\\end{${env}}`;const end=text.indexOf(closing,i);if(end<0)throw new Error('公式方程组或对齐环境未闭合');
      const body=text.slice(i,end);if(body.includes('\\begin'))throw new Error('暂不支持嵌套方程组');
      i=end+closing.length;
      if(env==='aligned') {
        const rows:string[][]=[];let row:string[]=[],cell='',depth=0;
        for(let p=0;p<body.length;p++){const c=body[p];if(c==='\\'){if(body[p+1]==='\\'&&depth===0){row.push(cell);rows.push(row);row=[];cell='';p++;continue;}cell+=c;if(p+1<body.length)cell+=body[++p];continue;}if(c==='{')depth++;if(c==='}')depth--;if(c==='&'&&depth===0){row.push(cell);cell='';}else cell+=c;}
        if(depth||cell.trim()||row.length){row.push(cell);rows.push(row);}if(!rows.length||rows.some(r=>r[0].trim().startsWith('[')))throw new Error('公式对齐环境无效');
        const columns=Math.max(...rows.map(r=>r.length));const props=Array.from({length:columns},(_,c)=>wrap('mc',wrap('mcPr',`<m:count m:val="1"/><m:mcJc m:val="${c%2?'left':'right'}"/>`))).join('');
        return wrap('m',wrap('mPr',wrap('mcs',props))+rows.map(r=>wrap('mr',Array.from({length:columns},(_,c)=>wrap('e',mathOmml(r[c]||''))).join(''))).join(''));
      }
      const rows=body.split(/\\\\/).map(s=>s.trim()).filter(Boolean);
      if(!rows.length)throw new Error('公式方程组为空');
      return delimiter(wrap('eqArr','<m:eqArrPr><m:baseJc m:val="center"/></m:eqArrPr>'+rows.map(s=>wrap('e',mathOmml(s.replace(/&/g,' ')))).join('')),'{','');
    }
    if(functions.has(name))return run(name,'p');
    if(symbols[name])return run(symbols[name],style);
    throw new Error(`公式暂不支持 ${name}，不能改用公式截图`);
  }
  function atom(style?:Style):string {
    const c=text[i];
    if(c==='\\')return command(style);
    if(c==='{'){i++;return sequence('}',style);}
    if(c==='('||c==='['){
      i++;let closing=c==='('?')':']';
      const body=sequence(')]',style,end=>{closing=end;});
      return delimiter(body,c,closing);
    }
    if(c==='√'){i++;return wrap('rad','<m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>'+wrap('e',group(style)));}
    if(c==='$')throw new Error('Unescaped math delimiter inside equation');
    const character=String.fromCodePoint(text.codePointAt(i)!);
    i+=character.length;return run(character,style);
  }
  function sequence(end?:string,style?:Style,onClose?:(end:string)=>void):string {
    const result:string[]=[];
    while(i<text.length){
      const c=text[i];if(end&&end.includes(c)){onClose?.(c);i++;return result.join('');}
      if(c==='}')throw new Error('公式出现多余的右花括号');
      if(c==='^'||c==='_'){
        i++;if(!result.length)throw new Error('公式上下标缺少底数');
        const base=result.pop()!;const script=group(style);
        skip();
        if(text[i]===(c==='_'?'^':'_')) {
          i++;const other=group(style);
          result.push(wrap('sSubSup',wrap('e',base)+wrap('sub',c==='_'?script:other)+wrap('sup',c==='^'?script:other)));
        } else result.push(wrap(c==='^'?'sSup':'sSub',wrap('e',base)+wrap(c==='^'?'sup':'sub',script)));
        continue;
      }
      if(superscripts[c]){
        if(!result.length)throw new Error('公式上标缺少底数');let value='';
        while(superscripts[text[i]])value+=superscripts[text[i++]];
        result.push(wrap('sSup',wrap('e',result.pop()!)+wrap('sup',run(value,'p'))));continue;
      }
      if(/\s/.test(c)){i++;continue;}
      result.push(atom(style));
    }
    if(end)throw new Error(`公式 ${end} 未闭合`);
    return result.join('');
  }
  return sequence();
}
