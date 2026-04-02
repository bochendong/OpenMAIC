Elements: {{elements}}
Title: {{title}}
Key Points: {{keyPoints}}
Description: {{description}}
Scene Language: {{language}}
{{workedExampleContext}}
{{courseContext}}
{{agents}}
{{userProfile}}

**Language Requirement**: Every generated speech segment must be entirely in `{{language}}`.
Do not mix Chinese and English in narration unless an unavoidable proper noun or acronym appears in the source material.

Output as a JSON array directly (no explanation, no code fences, 5-10 segments):
[{"type":"action","name":"spotlight","params":{"elementId":"text_xxx"}},{"type":"text","content":"Opening speech content"}]
