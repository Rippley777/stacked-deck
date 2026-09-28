import { CategoryIcon } from './ui';
export function HardwareArt({ category, variant = 0 }: { category: string; variant?: number }) {
  if (['Desktop Computer', 'Laptop', 'Mini PC', 'Server', 'All-in-One'].includes(category)) {
    const laptop = category === 'Laptop';
    return (
      <svg
        className="hardware-art art-computer"
        viewBox="0 0 280 180"
        fill="none"
        aria-hidden="true"
      >
        <ellipse cx="140" cy="150" rx="103" ry="11" fill="black" opacity=".2" />
        {category === 'Server' ? (
          <>
            <rect x="80" y="24" width="120" height="125" rx="7" fill="#253129" stroke="#789168" />
            {[39, 68, 97, 126].map((y) => (
              <g key={y}>
                <rect x="88" y={y} width="104" height="18" rx="3" fill="#17231c" stroke="#53654c" />
                <circle cx="179" cy={y + 9} r="2" fill="#bdec94" />
                <path d={`M100 ${y + 7}h55m-55 4h55`} stroke="#62745a" />
              </g>
            ))}
          </>
        ) : laptop ? (
          <>
            <rect x="61" y="30" width="158" height="104" rx="6" fill="#273329" stroke="#789168" />
            <rect x="69" y="38" width="142" height="86" rx="2" fill="#14211b" />
            <path d="m47 148 14-14h158l14 14v5H47z" fill="#687760" stroke="#899c78" />
            <path d="M116 143h49l5 6h-59z" fill="#374831" />
            <path
              d="m123 82 12 9 22-25"
              stroke="#a7cf83"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : (
          <>
            <rect x="42" y="38" width="137" height="92" rx="6" fill="#2b392d" stroke="#789168" />
            <rect x="50" y="46" width="121" height="75" rx="2" fill="#14211b" />
            <path d="M103 130v15m-22 4h44" stroke="#849a72" strokeWidth="5" strokeLinecap="round" />
            <path
              d="m94 84 12 9 22-25"
              stroke="#a7cf83"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {category !== 'All-in-One' && (
              <>
                <rect
                  x="193"
                  y="25"
                  width="43"
                  height="125"
                  rx="5"
                  fill="#273329"
                  stroke="#789168"
                />
                {[65, 110].map((y) => (
                  <g key={y}>
                    <circle cx="214" cy={y} r="15" fill="#14211b" stroke="#647d53" />
                    <circle cx="214" cy={y} r="8" stroke="#a7cf83" opacity=".65" />
                  </g>
                ))}
                <circle cx="215" cy="38" r="2" fill="#bdec94" />
              </>
            )}
          </>
        )}
      </svg>
    );
  }
  if (
    ![
      'GPU',
      'HDD',
      'SSD',
      'Raspberry Pi',
      'Microcontroller',
      'Development Board',
      'Switch',
      'Router',
      'Networking',
    ].includes(category)
  )
    return (
      <div
        className={`generic-hardware generic-${category.toLowerCase().replaceAll(' ', '-')}`}
        aria-hidden="true"
      >
        <div className="generic-hardware-frame">
          <CategoryIcon category={category} size={65} />
        </div>
        <span>{category.toUpperCase()}</span>
      </div>
    );
  const gpu = category === 'GPU';
  const storage = ['HDD', 'SSD', 'MicroSD'].includes(category);
  const network = ['Switch', 'Router', 'Networking'].includes(category);
  return (
    <svg
      className={`hardware-art art-${gpu ? 'gpu' : storage ? 'storage' : network ? 'network' : 'board'}`}
      viewBox="0 0 280 180"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="143" cy="145" rx="98" ry="14" fill="black" opacity=".18" />
      <g transform={`translate(140 87) rotate(${variant % 2 ? 9 : -9}) translate(-140 -87)`}>
        {gpu ? (
          <>
            <path d="M38 60h190v70H38z" fill="#323938" stroke="#626b66" />
            <path d="M45 53h172l11 7H38z" fill="#59605c" />
            <rect x="51" y="69" width="161" height="50" rx="7" fill="#1a1e1d" stroke="#454e47" />
            {[92, 171].map((x) => (
              <g key={x}>
                <circle cx={x} cy="94" r="23" fill="#252b28" stroke="#71796b" />
                {[0, 60, 120, 180, 240, 300].map((r) => (
                  <path
                    key={r}
                    d={`M${x} 94q-16-15-3-22q-3 12 8 16z`}
                    transform={`rotate(${r} ${x} 94)`}
                    fill="#65705e"
                  />
                ))}
                <circle cx={x} cy="94" r="7" fill="#9bac89" />
              </g>
            ))}
            <path d="M65 130v8h95v-8" fill="#b2a568" />
            <path d="M31 54v84h7V54z" fill="#929a94" />
            <path d="M217 61v60" stroke="#bfe3a3" strokeWidth="3" />
            <text x="105" y="65" fill="#bdc5b7" fontSize="5" letterSpacing="2">
              GEFORCE RTX
            </text>
          </>
        ) : storage ? (
          <>
            <rect x="73" y="33" width="133" height="109" rx="7" fill="#8a9290" stroke="#a2aaa5" />
            <rect x="81" y="40" width="116" height="94" rx="4" fill="#c8cebd" />
            <path d="M82 80h114v42H82z" fill="#d9dfcf" />
            <path d="M82 47h114v32H82z" fill="#4e6257" />
            <text x="91" y="62" fontSize="10" fontWeight="700" fill="#e5eddd">
              {category === 'HDD' ? 'HARD DRIVE' : 'SOLID STATE'}
            </text>
            <text x="92" y="104" fontSize="21" fill="#36433b" fontWeight="700">
              {category === 'HDD' ? 'HDD' : 'SSD'}
            </text>
            <path d="M95 114h70m-70 4h85" stroke="#899184" />
            {[87, 191].flatMap((x) =>
              [44, 128].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="2" fill="#59635a" />),
            )}
            <path d="M109 142h55v5h-55z" fill="#b6a365" />
          </>
        ) : network ? (
          <>
            <path d="m47 68 23-24h143l22 24v60H47z" fill="#53605b" stroke="#76867a" />
            <path d="M47 68h188v60H47z" fill="#252e29" />
            <text x="61" y="86" fontSize="8" fill="#a7b8a6">
              GIGABIT SWITCH
            </text>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <g key={i}>
                <rect
                  x={60 + i * 21}
                  y="95"
                  width="16"
                  height="19"
                  fill="#0f1812"
                  stroke="#69786c"
                />
                <path d={`M${64 + i * 21} 97v5m3-5v5m3-5v5`} stroke="#baa86c" />
                <circle cx={65 + i * 21} cy="119" r="1.5" fill="#c2ec9b" />
              </g>
            ))}
          </>
        ) : (
          <>
            <rect x="55" y="39" width="161" height="105" rx="7" fill="#4d7358" stroke="#8aab7b" />
            {[62, 207].flatMap((x) =>
              [47, 135].map((y) => (
                <circle key={`${x}${y}`} cx={x} cy={y} r="3.5" fill="#d4c999" stroke="#405743" />
              )),
            )}
            <path
              d="M87 54h70v64H87zm-21 57h47v22m45-71h28v54h-34M74 67v30h96v29"
              stroke="#8ea879"
              opacity=".65"
            />
            <rect x="111" y="68" width="40" height="40" rx="2" fill="#303b33" stroke="#b1b9a0" />
            <text x="120" y="88" fontSize="6" fill="#9aa991">
              BCM
            </text>
            <text x="117" y="97" fontSize="5" fill="#9aa991">
              2711
            </text>
            <rect x="77" y="51" width="92" height="8" fill="#202d23" />
            {Array.from({ length: 16 }, (_, i) => (
              <path key={i} d={`M${81 + i * 5.5} 52v6`} stroke="#c3b782" strokeWidth="2" />
            ))}
            {[65, 104].map((y) => (
              <g key={y}>
                <rect x="183" y={y} width="39" height="30" rx="2" fill="#aeb7a8" stroke="#d2d5c6" />
                <path d={`M193 ${y + 2}v26m6-26v26m6-26v26m6-26v26`} stroke="#7c887b" />
              </g>
            ))}
            <rect x="70" y="127" width="20" height="20" rx="2" fill="#b9c1b1" />
            <rect x="101" y="133" width="21" height="14" fill="#b3bdaa" />
            <rect x="136" y="132" width="19" height="15" fill="#b3bdaa" />
            <circle cx="165" cy="123" r="5" fill="#263c29" />
            <circle cx="70" cy="77" r="2" fill="#c8ed95" />
          </>
        )}
      </g>
    </svg>
  );
}
export function DeckIllustration() {
  return (
    <div className="deck-illustration" aria-hidden="true">
      <div className="illustrated-card back">
        <span>
          03 <span>◇</span>
        </span>
        <HardwareArt category="HDD" />
      </div>
      <div className="illustrated-card middle">
        <span>
          02 <span>♧</span>
        </span>
        <HardwareArt category="GPU" />
      </div>
      <div className="illustrated-card front">
        <span>
          01 <span>♠</span>
        </span>
        <HardwareArt category="Raspberry Pi" />
        <div className="illustrated-caption">
          Raspberry Pi 4<span>8GB · THE POSSIBILITIES</span>
        </div>
        <span className="card-bottom">♠</span>
      </div>
    </div>
  );
}
