"use strict";

const assert = require("assert");
const {
  LIMITS,
  applyRulesDetailed,
  evaluateExpression,
  normalizeValue,
  replaceFieldReferences,
  tokenize
} = require("./expression");

function throws(expression, row, pattern) {
  assert.throws(() => evaluateExpression(expression, row), pattern, expression);
}

function main() {
  const quote = {
    数量: 3,
    单价: 12800,
    优惠: 1800,
    税率: "13%",
    区域: "华东",
    "含 空格": 9
  };

  assert.strictEqual(
    evaluateExpression("round((数量 * 单价 - 优惠) * (1 + 税率), 2)", quote),
    41358
  );
  assert.strictEqual(evaluateExpression("[含 空格] + 1", quote), 10);
  assert.strictEqual(evaluateExpression("round(10.075, 2)"), 10.08);
  assert.strictEqual(evaluateExpression("round(-10.075, 2)"), -10.08);
  assert.strictEqual(evaluateExpression("round(1.005, 2)"), 1.01);
  assert.strictEqual(evaluateExpression("round(1.0049, 2)"), 1);
  assert.strictEqual(evaluateExpression("coalesce(blank, 0.13)", { blank: "" }), 0.13);
  assert.strictEqual(evaluateExpression("coalesce(value, 0)", { value: 0 }), 0);
  assert.strictEqual(evaluateExpression("2 ** 3 ** 2"), 512);
  assert.strictEqual(evaluateExpression("max(abs(-4), ceil(2.1), floor(3.9), min(9, 5))"), 5);
  assert.strictEqual(evaluateExpression("区域 == \"华东\" ? \"国内\" : \"海外\"", quote), "国内");
  assert.strictEqual(evaluateExpression("\"QT-\" + 数量", quote), "QT-3");
  assert.strictEqual(evaluateExpression("数量 > 0 AND 优惠 >= 0", quote), true);
  assert.strictEqual(evaluateExpression("数量 > 0 且 优惠 >= 0", quote), true);
  assert.strictEqual(evaluateExpression("非 false"), true);
  assert.strictEqual(evaluateExpression("销售或服务 == \"服务\"", { 销售或服务: "服务" }), true);
  assert.strictEqual(evaluateExpression("\"beta\" > \"alpha\""), true);
  assert.strictEqual(evaluateExpression("[true] + 1", { true: 4 }), 5);

  const collisions = { round: 7, min: 2, max: 11, a: 3 };
  assert.strictEqual(
    evaluateExpression("round(a) + [round] + min(a, [min]) + [max]", collisions),
    23
  );
  assert.strictEqual(evaluateExpression("round + min + max", collisions), 20);

  const replaced = replaceFieldReferences("round(a) + [round]", collisions);
  assert.strictEqual(evaluateExpression(replaced.expression, replaced.variables), 10);
  assert.match(replaced.expression, /^round \(/);
  const reservedReplacement = replaceFieldReferences("true ? [true] : 0", { true: 4 });
  assert.strictEqual(evaluateExpression(reservedReplacement.expression, reservedReplacement.variables), 4);

  assert.strictEqual(evaluateExpression("false && (1 / 0)"), false);
  assert.strictEqual(evaluateExpression("true || missing"), true);
  assert.strictEqual(evaluateExpression("false && unknown()"), false);
  assert.strictEqual(evaluateExpression("true ? \"ok\" : unknown()"), "ok");
  assert.strictEqual(evaluateExpression("a != 0 ? 10 / a : 0", { a: 0 }), 0);
  assert.strictEqual(evaluateExpression("a == 0 || 10 / a > 1", { a: 0 }), true);

  throws("1 / 0", {}, /除以零/);
  throws("1 % 0", {}, /除以零/);
  throws("missing + 1", {}, /未知字段/);
  throws("unknown(1)", {}, /不支持的公式函数/);
  throws("process.exit()", {}, /不支持的字符/);
  throws("round(1.25, 13)", {}, /0–12/);
  throws("min()", {}, /需要 1–64 个参数/);
  throws("[missing]", {}, /未知字段/);
  throws("blank * 10", { blank: "" }, /为空/);
  throws("\"unterminated", {}, /结束引号/);
  throws("[unterminated", {}, /结束方括号/);

  const tooManyTerms = Array.from({ length: 130 }, () => "1").join("+");
  throws(tooManyTerms, {}, /令牌数量/);
  throws(" ".repeat(LIMITS.maxExpressionLength + 1), {}, /长度/);
  throws(`${"(".repeat(LIMITS.maxNestingDepth + 1)}1${")".repeat(LIMITS.maxNestingDepth + 1)}`, {}, /嵌套层级/);
  throws(`${"!".repeat(LIMITS.maxNestingDepth + 1)}false`, {}, /嵌套层级/);
  throws(`1 ** ${LIMITS.maxExponentMagnitude + 1}`, {}, /指数超出/);
  throws(String(Number.MAX_SAFE_INTEGER + 1), {}, /数字常量超出安全数值范围/);
  throws(`${Number.MAX_SAFE_INTEGER} + 1`, {}, /公式结果超出安全数值范围/);
  throws("[big]", { big: "x".repeat(LIMITS.maxStringResultLength + 1) }, /文本过长/);
  throws(
    `min(${Array.from({ length: LIMITS.maxFunctionArguments + 1 }, () => "1").join(",")})`,
    {},
    /参数数量超过限制/
  );
  throws("[object]", { object: { unsafe: true } }, /必须是文本、数字、布尔值或空值/);

  assert.strictEqual(normalizeValue("13%"), 0.13);
  assert.strictEqual(normalizeValue("¥1,234.50"), 1234.5);
  assert.strictEqual(normalizeValue("是"), true);
  assert.strictEqual(tokenize("数量 × 单价").find(token => token.value === "*").type, "operator");

  const rules = applyRulesDetailed(
    [
      { qty: 2, price: 100, discount: 10, customer: "甲" },
      { qty: 0, price: 100, discount: 0, customer: "乙" }
    ],
    [
      { name: "subtotal", expression: "qty * price" },
      { name: "total", expression: "round(subtotal - discount, 2)" },
      { name: "broken", expression: "1 / 0" }
    ],
    [
      { name: "showDiscount", expression: "discount > 0" },
      {
        name: "discountLabel",
        expression: "discount > 0",
        whenTrue: "{{customer}}优惠 {{discount}}",
        whenFalse: "无优惠"
      },
      { name: "safeRatio", expression: "qty == 0 || total / qty >= 0" },
      { name: "badCondition", expression: "unknown()" }
    ]
  );

  assert.deepStrictEqual(
    rules.rows.map(row => ({
      subtotal: row.subtotal,
      total: row.total,
      broken: row.broken,
      showDiscount: row.showDiscount,
      discountLabel: row.discountLabel,
      safeRatio: row.safeRatio,
      badCondition: row.badCondition
    })),
    [
      {
        subtotal: 200,
        total: 190,
        broken: "",
        showDiscount: true,
        discountLabel: "甲优惠 10",
        safeRatio: true,
        badCondition: false
      },
      {
        subtotal: 0,
        total: 0,
        broken: "",
        showDiscount: false,
        discountLabel: "无优惠",
        safeRatio: true,
        badCondition: false
      }
    ]
  );
  assert.deepStrictEqual(
    rules.errors.map(error => [error.rowIndex, error.field, error.kind]),
    [
      [0, "broken", "computed"],
      [0, "badCondition", "conditional"],
      [1, "broken", "computed"],
      [1, "badCondition", "conditional"]
    ]
  );

  const dependencies = applyRulesDetailed(
    [{ base: 2 }],
    [
      { name: "result", expression: "eligible ? later + 1 : 0" },
      { name: "later", expression: "base * 3" }
    ],
    [{ name: "eligible", expression: "base > 0" }]
  );
  assert.deepStrictEqual(
    { result: dependencies.rows[0].result, later: dependencies.rows[0].later, eligible: dependencies.rows[0].eligible },
    { result: 7, later: 6, eligible: true }
  );
  assert.deepStrictEqual(dependencies.errors, []);

  const cycle = applyRulesDetailed(
    [{ base: 1 }],
    [
      { name: "a", expression: "b + 1" },
      { name: "b", expression: "a + 1" }
    ]
  );
  assert.strictEqual(cycle.errors.length, 2);
  assert.deepStrictEqual([cycle.rows[0].a, cycle.rows[0].b], ["", ""]);

  console.log("DocFlow expression tests passed:", {
    calculations: true,
    conditions: true,
    fieldCollisions: true,
    shortCircuiting: true,
    safetyLimits: true,
    ruleErrors: rules.errors.length
  });
}

main();
