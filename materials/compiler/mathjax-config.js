window.MathJax = {
      startup: {
        typeset: false
      },
      tex: {
        inlineMath: [
          ["\\(", "\\)"],
          ["$", "$"]
        ],
        displayMath: [
          ["\\[", "\\]"],
          ["$$", "$$"]
        ],
        tags: "ams",
        useLabelIds: true,
        processEscapes: true,
        macros: {
          bval: ["\\left\\unicode{x27E6} #1 \\right\\unicode{x27E7}", 1],
          be: ["#1:\\text{#2}", 2],
          proves: "\\vdash",
          forces: "\\Vdash",
          PA: "\\mathrm{PA}",
          BST: "\\mathrm{BST}",
          ZF: "\\mathrm{ZF}",
          ZFC: "\\mathrm{ZFC}",
          Con: "\\mathrm{Con}",
          MA: "\\mathrm{MA}",
          HF: "\\mathrm{HF}",
          set: ["\\{{}#1{}\\}", 1],
          power: "\\mathcal{P}",
          Def: "\\mathrm{def}",
          val: "\\mathrm{val}",
          prm: "\\mathrm{prm}",
          img: "\\text{``}",
          dom: "\\mathrm{dom}",
          ran: "\\mathrm{ran}",
          inj: "\\overset{1-1}{\\longrightarrow}",
          surj: "\\overset{onto}{\\longrightarrow}",
          bij: "\\xrightarrow[onto]{1-1}",
          iso: "\\overset{\\sim}{\\longrightarrow}",
          ee: "\\overset{\\prec}{\\rightarrow}",
          ON: "\\mathrm{ON}",
          ot: "\\mathrm{ot}",
          cf: "\\mathrm{cf}",
          len: "\\mathrm{len}",
          club: "\\mathrm{club}",
          nonstat: "\\mathrm{nonstat}",
          inn: "\\varepsilon",
          obj: ["\\ulcorner #1\\urcorner", 1],
          bbepsilon: "\\mathord{\\unicode{x03F5}}",
          mathbbl: ["\\mathbb{#1}", 1]
        }
      },
      chtml: {
        displayAlign: "left",
        displayIndent: "1.5em"
      },
      options: {
        skipHtmlTags: [
          "script",
          "noscript",
          "style",
          "textarea",
          "pre",
          "code"
        ]
      }
    };
