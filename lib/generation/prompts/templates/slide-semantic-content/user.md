# Generation Requirements

## Scene Information

- **Title**: {{title}}
- **Description**: {{description}}
- **Key Points**:
  {{keyPoints}}

{{workedExampleContext}}
{{teacherContext}}
{{coursePersonalization}}

## Output Requirements

Generate the semantic teaching content document for exactly one slide.

Important:

1. Output pure JSON only
2. Do not wrap the JSON in markdown code fences
3. Do not output slide coordinates, HTML, or PPT elements
4. Keep the language consistent with the title/description above
5. If the scene contains formulas, worked examples, matrix operations, code, or tables, use the corresponding structured blocks instead of plain paragraphs whenever possible
