"use strict";

const LIMITS = Object.freeze({
  maxExpressionLength: 2048,
  maxTokens: 256,
  maxNestingDepth: 32,
  maxExponentMagnitude: 100,
  maxAbsoluteNumber: Number.MAX_SAFE_INTEGER,
  maxStringResultLength: 16 * 1024,
  maxFunctionArguments: 64
});

const PRECEDENCE = Object.freeze({
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  ">": 4,
  ">=": 4,
  "<": 4,
  "<=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
  "^": 7,
  "**": 7
});

const RIGHT_ASSOCIATIVE = new Set(["^", "**"]);

function ensureSafeNumber(value, label = "公式结果") {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    throw new Error(`${label}为空，不能参与数值运算`);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${label}不是有限数值`);
  if (Math.abs(numeric) > LIMITS.maxAbsoluteNumber) {
    throw new Error(`${label}超出安全数值范围`);
  }
  return numeric;
}

function ensureSafeValue(value, label = "公式结果") {
  if (typeof value === "number") return ensureSafeNumber(value, label);
  if (typeof value === "string" && value.length > LIMITS.maxStringResultLength) {
    throw new Error(`${label}文本过长`);
  }
  if (value == null || typeof value === "string" || typeof value === "boolean") return value;
  throw new Error(`${label}必须是文本、数字、布尔值或空值`);
}

function normalizeValue(value) {
  if (typeof value === "number") return ensureSafeNumber(value, "字段值");
  if (typeof value === "boolean" || value == null) return value ?? "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string") return value;

  const text = value.trim();
  if (!text) return "";
  const numeric = text
    .replaceAll(",", "")
    .replace(/[¥￥$€£]/g, "")
    .replace(/\s+/g, "");
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(numeric)) {
    return ensureSafeNumber(Number(numeric.slice(0, -1)) / 100, "字段值");
  }
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(numeric)) {
    return ensureSafeNumber(Number(numeric), "字段值");
  }
  if (/^(true|yes|是|真)$/i.test(text)) return true;
  if (/^(false|no|否|假)$/i.test(text)) return false;
  return value;
}

function pushToken(tokens, token) {
  if (tokens.length >= LIMITS.maxTokens) throw new Error("公式令牌数量超过限制");
  tokens.push(token);
}

function tokenize(expression) {
  const source = String(expression ?? "");
  if (source.length > LIMITS.maxExpressionLength) throw new Error("公式长度超过限制");
  if (!source.trim()) throw new Error("公式不能为空");

  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const rest = source.slice(index);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }

    if (source[index] === "[") {
      let fieldName = "";
      let closed = false;
      index += 1;
      while (index < source.length) {
        const character = source[index];
        if (character === "\\" && source[index + 1] === "]") {
          fieldName += "]";
          index += 2;
        } else if (character === "]") {
          index += 1;
          closed = true;
          break;
        } else {
          fieldName += character;
          index += 1;
        }
      }
      if (!closed) throw new Error("字段引用缺少结束方括号");
      fieldName = fieldName.trim();
      if (!fieldName) throw new Error("字段引用不能为空");
      pushToken(tokens, { type: "field", value: fieldName });
      continue;
    }

    const quote = source[index];
    if (quote === "'" || quote === '"') {
      let value = "";
      let closed = false;
      index += 1;
      while (index < source.length) {
        const character = source[index];
        if (character === "\\") {
          const next = source[index + 1];
          if (next == null) break;
          value += ({ n: "\n", r: "\r", t: "\t" })[next] ?? next;
          index += 2;
        } else if (character === quote) {
          index += 1;
          closed = true;
          break;
        } else {
          value += character;
          index += 1;
        }
      }
      if (!closed) throw new Error("字符串缺少结束引号");
      pushToken(tokens, { type: "literal", value });
      continue;
    }

    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (number) {
      const value = ensureSafeNumber(Number(number[0]), "数字常量");
      pushToken(tokens, { type: "literal", value });
      index += number[0].length;
      continue;
    }

    const identifier = rest.match(/^[\p{L}_$][\p{L}\p{N}_$]*/u);
    if (identifier) {
      const value = identifier[0];
      const keyword = value.toUpperCase();
      if (keyword === "AND" || value === "且") {
        pushToken(tokens, { type: "operator", value: "&&" });
      } else if (keyword === "OR" || value === "或") {
        pushToken(tokens, { type: "operator", value: "||" });
      } else if (keyword === "NOT" || value === "非") {
        pushToken(tokens, { type: "operator", value: "!" });
      } else {
        pushToken(tokens, { type: "identifier", value });
      }
      index += value.length;
      continue;
    }

    const multiCharacterOperator = ["!==", "===", ">=", "<=", "==", "!=", "&&", "||", "**"]
      .find(candidate => rest.startsWith(candidate));
    if (multiCharacterOperator) {
      pushToken(tokens, {
        type: "operator",
        value: multiCharacterOperator === "==="
          ? "=="
          : multiCharacterOperator === "!=="
            ? "!="
            : multiCharacterOperator
      });
      index += multiCharacterOperator.length;
      continue;
    }

    const glyphOperator = { "×": "*", "÷": "/", "−": "-" }[source[index]];
    if (glyphOperator) {
      pushToken(tokens, { type: "operator", value: glyphOperator });
      index += 1;
      continue;
    }

    if ("+-*/%^><!".includes(source[index])) {
      pushToken(tokens, { type: "operator", value: source[index] });
      index += 1;
      continue;
    }
    if ("(),?:".includes(source[index])) {
      pushToken(tokens, { type: "punctuation", value: source[index] });
      index += 1;
      continue;
    }
    throw new Error(`公式包含不支持的字符：${source[index]}`);
  }

  tokens.push({ type: "eof", value: "" });
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  current() {
    return this.tokens[this.index];
  }

  assertDepth(depth) {
    if (depth > LIMITS.maxNestingDepth) throw new Error("公式嵌套层级超过限制");
  }

  consume(type, value) {
    const token = this.current();
    if (token.type !== type || (value != null && token.value !== value)) {
      throw new Error(`公式语法错误，期望 ${value ?? type}`);
    }
    this.index += 1;
    return token;
  }

  parse() {
    const node = this.parseTernary(0);
    if (this.current().type !== "eof") throw new Error("公式末尾存在多余内容");
    return node;
  }

  parseTernary(depth) {
    this.assertDepth(depth);
    const condition = this.parseBinary(1, depth);
    if (this.current().value !== "?") return condition;
    this.consume("punctuation", "?");
    const whenTrue = this.parseTernary(depth + 1);
    this.consume("punctuation", ":");
    const whenFalse = this.parseTernary(depth + 1);
    return { type: "ternary", condition, whenTrue, whenFalse };
  }

  parseBinary(minimumPrecedence, depth) {
    this.assertDepth(depth);
    let left = this.parseUnary(depth);
    while (this.current().type === "operator") {
      const operator = this.current().value;
      const precedence = PRECEDENCE[operator];
      if (!precedence || precedence < minimumPrecedence) break;
      this.index += 1;
      const nextPrecedence = precedence + (RIGHT_ASSOCIATIVE.has(operator) ? 0 : 1);
      const right = this.parseBinary(nextPrecedence, depth + (RIGHT_ASSOCIATIVE.has(operator) ? 1 : 0));
      left = { type: "binary", operator, left, right };
    }
    return left;
  }

  parseUnary(depth) {
    this.assertDepth(depth);
    const token = this.current();
    if (token.type === "operator" && ["!", "+", "-"].includes(token.value)) {
      this.index += 1;
      return { type: "unary", operator: token.value, value: this.parseUnary(depth + 1) };
    }
    return this.parsePrimary(depth);
  }

  parsePrimary(depth) {
    this.assertDepth(depth);
    const token = this.current();
    if (token.type === "literal") {
      this.index += 1;
      return { type: "literal", value: token.value };
    }
    if (token.type === "field") {
      this.index += 1;
      return { type: "field", name: token.value };
    }
    if (token.type === "punctuation" && token.value === "(") {
      this.index += 1;
      const value = this.parseTernary(depth + 1);
      this.consume("punctuation", ")");
      return value;
    }
    if (token.type !== "identifier") throw new Error("公式中缺少数值或字段");

    this.index += 1;
    const name = token.value;
    if (this.current().value === "(") {
      this.index += 1;
      const argumentsList = [];
      if (this.current().value !== ")") {
        while (true) {
          if (argumentsList.length >= LIMITS.maxFunctionArguments) {
            throw new Error("公式函数参数数量超过限制");
          }
          argumentsList.push(this.parseTernary(depth + 1));
          if (this.current().value !== ",") break;
          this.index += 1;
        }
      }
      this.consume("punctuation", ")");
      return { type: "call", name, arguments: argumentsList };
    }
    if (name === "true") return { type: "literal", value: true };
    if (name === "false") return { type: "literal", value: false };
    if (name === "null") return { type: "literal", value: null };
    return { type: "field", name };
  }
}

function fieldValue(row, name) {
  if (!Object.prototype.hasOwnProperty.call(row, name)) throw new Error(`未知字段或标识符：${name}`);
  return ensureSafeValue(normalizeValue(row[name]), `字段 ${name}`);
}

function numericArguments(name, values, minimum, maximum = minimum) {
  if (values.length < minimum || values.length > maximum) {
    const expected = minimum === maximum ? String(minimum) : `${minimum}–${maximum}`;
    throw new Error(`${name} 需要 ${expected} 个参数`);
  }
  return values.map((value, index) => ensureSafeNumber(value, `${name} 第 ${index + 1} 个参数`));
}

function callFunction(name, values) {
  if (name === "coalesce") {
    if (values.length < 2 || values.length > LIMITS.maxFunctionArguments) {
      throw new Error(`coalesce 需要 2–${LIMITS.maxFunctionArguments} 个参数`);
    }
    const value = values.find(item => item != null && !(typeof item === "string" && item.trim() === ""));
    return ensureSafeValue(value ?? "");
  }
  let result;
  switch (name) {
    case "abs": {
      const [value] = numericArguments(name, values, 1);
      result = Math.abs(value);
      break;
    }
    case "ceil": {
      const [value] = numericArguments(name, values, 1);
      result = Math.ceil(value);
      break;
    }
    case "floor": {
      const [value] = numericArguments(name, values, 1);
      result = Math.floor(value);
      break;
    }
    case "min": {
      const args = numericArguments(name, values, 1, LIMITS.maxFunctionArguments);
      result = Math.min(...args);
      break;
    }
    case "max": {
      const args = numericArguments(name, values, 1, LIMITS.maxFunctionArguments);
      result = Math.max(...args);
      break;
    }
    case "round": {
      const args = numericArguments(name, values, 1, 2);
      const digits = args[1] ?? 0;
      if (!Number.isInteger(digits) || digits < 0 || digits > 12) {
        throw new Error("round 的小数位必须是 0–12 的整数");
      }
      const sign = Math.sign(args[0]) || 1;
      const [coefficient, exponent = "0"] = String(Math.abs(args[0])).split("e");
      const shifted = Number(`${coefficient}e${Number(exponent) + digits}`);
      const rounded = Math.round(shifted);
      const [roundedCoefficient, roundedExponent = "0"] = String(rounded).split("e");
      result = sign * Number(`${roundedCoefficient}e${Number(roundedExponent) - digits}`);
      break;
    }
    default:
      throw new Error(`不支持的公式函数：${name}`);
  }
  return ensureSafeNumber(result, `${name} 结果`);
}

function relationalValues(left, right) {
  if (typeof left === "string" && typeof right === "string") return [left, right];
  return [
    ensureSafeNumber(left, "比较左值"),
    ensureSafeNumber(right, "比较右值")
  ];
}

function evaluateBinary(operator, left, right) {
  let result;
  switch (operator) {
    case "==":
      return left === right || String(left) === String(right);
    case "!=":
      return !(left === right || String(left) === String(right));
    case ">": {
      const values = relationalValues(left, right);
      return values[0] > values[1];
    }
    case ">=": {
      const values = relationalValues(left, right);
      return values[0] >= values[1];
    }
    case "<": {
      const values = relationalValues(left, right);
      return values[0] < values[1];
    }
    case "<=": {
      const values = relationalValues(left, right);
      return values[0] <= values[1];
    }
    case "+":
      result = typeof left === "string" || typeof right === "string"
        ? String(left ?? "") + String(right ?? "")
        : ensureSafeNumber(left, "加法左值") + ensureSafeNumber(right, "加法右值");
      break;
    case "-":
      result = ensureSafeNumber(left, "减法左值") - ensureSafeNumber(right, "减法右值");
      break;
    case "*":
      result = ensureSafeNumber(left, "乘法左值") * ensureSafeNumber(right, "乘法右值");
      break;
    case "/": {
      const divisor = ensureSafeNumber(right, "除数");
      if (divisor === 0) throw new Error("公式不能除以零");
      result = ensureSafeNumber(left, "被除数") / divisor;
      break;
    }
    case "%": {
      const divisor = ensureSafeNumber(right, "除数");
      if (divisor === 0) throw new Error("公式不能除以零");
      result = ensureSafeNumber(left, "被除数") % divisor;
      break;
    }
    case "^":
    case "**": {
      const base = ensureSafeNumber(left, "指数底数");
      const exponent = ensureSafeNumber(right, "指数");
      if (Math.abs(exponent) > LIMITS.maxExponentMagnitude) throw new Error("指数超出允许范围");
      result = base ** exponent;
      break;
    }
    default:
      throw new Error(`不支持的运算符：${operator}`);
  }
  return ensureSafeValue(result);
}

function evaluateNode(node, row) {
  switch (node.type) {
    case "literal":
      return ensureSafeValue(node.value);
    case "field":
      return fieldValue(row, node.name);
    case "unary": {
      const value = evaluateNode(node.value, row);
      if (node.operator === "!") return !value;
      if (node.operator === "+") return ensureSafeNumber(value, "一元加法结果");
      if (node.operator === "-") return ensureSafeNumber(-ensureSafeNumber(value, "一元减法值"), "一元减法结果");
      throw new Error(`不支持的一元运算符：${node.operator}`);
    }
    case "binary": {
      const left = evaluateNode(node.left, row);
      if (node.operator === "&&") return left ? evaluateNode(node.right, row) : left;
      if (node.operator === "||") return left ? left : evaluateNode(node.right, row);
      return evaluateBinary(node.operator, left, evaluateNode(node.right, row));
    }
    case "ternary":
      return evaluateNode(node.condition, row)
        ? evaluateNode(node.whenTrue, row)
        : evaluateNode(node.whenFalse, row);
    case "call": {
      if (!["round", "min", "max", "abs", "ceil", "floor", "coalesce"].includes(node.name)) {
        throw new Error(`不支持的公式函数：${node.name}`);
      }
      return callFunction(node.name, node.arguments.map(argument => evaluateNode(argument, row)));
    }
    default:
      throw new Error("公式包含未知节点");
  }
}

function evaluateExpression(expression, row = {}) {
  const syntaxTree = new Parser(tokenize(expression)).parse();
  return ensureSafeValue(evaluateNode(syntaxTree, row));
}

function tokenSource(token) {
  if (token.type === "literal") return typeof token.value === "string" ? JSON.stringify(token.value) : String(token.value);
  if (token.type === "field") return `[${token.value.replaceAll("]", "\\]")}]`;
  return String(token.value);
}

function replaceFieldReferences(expression, row = {}) {
  const tokens = tokenize(expression);
  const aliases = {};
  const fieldAliases = new Map();
  const aliasFor = field => {
    if (fieldAliases.has(field)) return fieldAliases.get(field);
    const alias = `__field_${fieldAliases.size}`;
    fieldAliases.set(field, alias);
    aliases[alias] = ensureSafeValue(normalizeValue(row[field]), `字段 ${field}`);
    return alias;
  };

  const output = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (token.type === "field") {
      if (!Object.prototype.hasOwnProperty.call(row, token.value)) {
        throw new Error(`未知字段或标识符：${token.value}`);
      }
      output.push(aliasFor(token.value));
    } else if (
      token.type === "identifier"
      && tokens[index + 1]?.value !== "("
      && !["true", "false", "null"].includes(token.value)
      && Object.prototype.hasOwnProperty.call(row, token.value)
    ) {
      output.push(aliasFor(token.value));
    } else {
      output.push(tokenSource(token));
    }
  }
  return { expression: output.join(" "), variables: aliases };
}

function renderRuleValue(value, row) {
  if (typeof value !== "string") return ensureSafeValue(value);
  const rendered = value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, field) => String(row[field.trim()] ?? ""));
  return ensureSafeValue(rendered);
}

function applyRulesDetailed(rows, computedFields = [], conditionalFields = []) {
  const errors = [];
  const output = (rows || []).map((source, rowIndex) => {
    const row = { ...source };
    const pending = [
      ...(computedFields || []).map(field => ({ field, kind: "computed" })),
      ...(conditionalFields || []).map(field => ({ field, kind: "conditional" }))
    ].filter(({ field }) => String(field?.name || "").trim() && String(field?.expression || "").trim());
    const failed = [];

    while (pending.length) {
      let progressed = false;
      for (let index = 0; index < pending.length;) {
        const { field, kind } = pending[index];
        const name = String(field.name).trim();
        const expression = String(field.expression).trim();
        try {
          if (kind === "computed") {
            const result = evaluateExpression(expression, row);
            row[name] = typeof result === "number" && Number.isInteger(field.digits)
              ? callFunction("round", [result, field.digits])
              : result;
          } else {
            const matched = Boolean(evaluateExpression(expression, row));
            const hasBranches = Object.prototype.hasOwnProperty.call(field, "whenTrue")
              || Object.prototype.hasOwnProperty.call(field, "whenFalse");
            row[name] = hasBranches
              ? renderRuleValue(matched ? field.whenTrue ?? "" : field.whenFalse ?? "", row)
              : matched;
          }
          pending.splice(index, 1);
          progressed = true;
          continue;
        } catch (error) {
          if (/未知字段或标识符/.test(error.message || "")) {
            index += 1;
            continue;
          }
          errors.push({ rowIndex, field: name, kind, message: error.message });
          failed.push({ name, kind });
          pending.splice(index, 1);
          progressed = true;
          continue;
        }
      }
      if (progressed) continue;

      // The remaining rules reference absent fields or form a dependency
      // cycle. Report each one instead of silently depending on UI order.
      for (const { field, kind } of pending) {
        const name = String(field.name).trim();
        try {
          evaluateExpression(String(field.expression).trim(), row);
        } catch (error) {
          errors.push({ rowIndex, field: name, kind, message: error.message });
        }
        failed.push({ name, kind });
      }
      pending.length = 0;
    }

    for (const { name, kind } of failed) {
      if (!Object.prototype.hasOwnProperty.call(row, name)) row[name] = kind === "conditional" ? false : "";
    }
    return row;
  });
  return { rows: output, errors };
}

module.exports = {
  LIMITS,
  applyRulesDetailed,
  evaluateExpression,
  normalizeValue,
  replaceFieldReferences,
  tokenize
};
