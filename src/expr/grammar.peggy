// BYE Math Engine expression grammar.
// Produces a raw AST (see ast.ts). Names are not resolved here: `f(1)` and
// `x(x+1)` both parse to an `apply` node; resolve.ts decides call vs product.
//
// Precedence, lowest first:
//   a + b, a - b
//   a * b, a / b, implicit a b       (all left-assoc, same level: 1/2x = (1/2)*x)
//   -a, +a                           (so -x^2 = -(x^2))
//   a ^ b                            (right-assoc: 2^3^2 = 2^(3^2); exponent may be signed: 2^-x)
//   number, name, name(args), (expr)
//
// Implicit multiplication: a factor that starts with a name or "(" may follow
// another factor directly: 2x, 3sin(x), 2(x+1), (x+1)(x-1), x sin(x), 2pi x.
// A bare number can't be the right-hand side ("(x+1)2" is an error).

{{
  function bin(op, left, right, implicit, loc) {
    return { type: 'bin', op, left, right, implicit, start: loc.start.offset, end: loc.end.offset };
  }
}}

Start
  = _ e:Additive _ { return e; }

Additive
  = head:Term tail:(_ op:AddOp _ t:Term { return { op, t, loc: location() }; })* {
      return tail.reduce((acc, { op, t, loc }) => bin(op, acc, t, false, { start: { offset: acc.start }, end: loc.end }), head);
    }

Term
  = head:Unary tail:(
        _ op:MulOp _ u:Unary { return { op, u, implicit: false, loc: location() }; }
      / _ u:ImplicitFactor   { return { op: '*', u, implicit: true, loc: location() }; }
    )* {
      return tail.reduce((acc, { op, u, implicit, loc }) => bin(op, acc, u, implicit, { start: { offset: acc.start }, end: loc.end }), head);
    }

ImplicitFactor
  = &(Name / "(") p:Power { return p; }

Unary
  = op:SignOp _ u:Unary {
      const loc = location();
      return op === '-' ? { type: 'neg', arg: u, start: loc.start.offset, end: loc.end.offset } : u;
    }
  / Power

Power
  = base:Primary _ PowOp _ exp:Unary {
      return bin('^', base, exp, false, location());
    }
  / Primary

Primary
  = Number
  / Apply
  / n:Name { const loc = location(); return { type: 'name', name: n, start: loc.start.offset, end: loc.end.offset }; }
  / "(" _ e:Additive _ ")" { return e; }

Apply
  = n:Name _ "(" _ args:ArgList _ ")" {
      const loc = location();
      return { type: 'apply', callee: n, args, start: loc.start.offset, end: loc.end.offset };
    }

ArgList
  = head:Additive tail:(_ "," _ e:Additive { return e; })* { return [head, ...tail]; }

Number "number"
  = digits:$([0-9]+ ("." [0-9]*)? / "." [0-9]+) {
      const loc = location();
      return { type: 'num', value: parseFloat(digits), start: loc.start.offset, end: loc.end.offset };
    }

Name "name"
  = $([a-zA-Z_] [a-zA-Z0-9_]*)
  / "π" { return 'pi'; }

AddOp = "+" { return '+'; } / ("-" / "−") { return '-'; }
MulOp = ("*" / "×" / "·") { return '*'; } / ("/" / "÷") { return '/'; }
SignOp = "+" { return '+'; } / ("-" / "−") { return '-'; }
PowOp = "^"

_ "whitespace"
  = [ \t\r\n]*
