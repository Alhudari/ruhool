# Round 2 — bilingual copy review (MSA verdict per string)

## Routing chain + drawer

| key                    | en                         | ar (MSA)                                | verdict |
|------------------------|----------------------------|-----------------------------------------|---------|
| chain.label            | dispatch chain             | سلسلة الإسناد                           | ok      |
| drawer.title           | Dispatch detail            | تفاصيل الإسناد                          | ok      |
| drawer.close           | Close                      | أغلق                                    | ok      |
| drawer.empty           | No dispatches yet          | لم يبدأ أي إسناد بعد                    | ok      |
| role.ceo               | CEO                        | المدير العام                            | ok      |
| role.manager           | Manager                    | مدير القسم                              | ok      |
| role.worker            | Worker                     | عامل                                    | ok      |
| duration               | duration: {ms}ms           | المدة: {ms} مللي                        | ok      |
| budgetCapped           | cost cap applied           | تم تطبيق حد التكلفة                     | ok      |

## Zotero sync bar v2

| key                | en                          | ar (MSA)                       | verdict |
|--------------------|-----------------------------|--------------------------------|---------|
| writeMode.enabled  | write enabled               | كتابة مفعّلة                   | ok      |
| writeMode.readOnly | read-only                   | قراءة فقط                      | ok      |
| dryRun.label       | dry-run                     | معاينة فقط                     | ok      |
| btn.preview        | Preview now                 | عاين الآن                      | ok      |

## Write API key field

| key              | en                                 | ar (MSA)                          | verdict |
|------------------|------------------------------------|-----------------------------------|---------|
| label            | Write API key (optional)           | مفتاح الكتابة (اختياري)           | ok      |
| savedHint        | (saved)                            | (محفوظ)                           | ok      |
| showToggle       | Show / Hide                        | إظهار / إخفاء                     | ok      |
| enableWrite      | Enable writes back to Zotero       | فعّل الكتابة إلى Zotero            | ok      |
| saveBtn          | Save write settings                | احفظ إعدادات الكتابة              | ok      |
| helpText         | Separate write-scoped key...       | مفتاح منفصل بصلاحية الكتابة...    | ok      |

## Dispatcher fallback messages

| key                | en                                                  | ar (MSA)                                                 | verdict |
|--------------------|-----------------------------------------------------|----------------------------------------------------------|---------|
| fallback.noResponse| I don't know — team did not return a usable response | لا أعرف — تعذّر الحصول على إجابة من الفريق               | ok      |
| budgetCapped       | Task could not complete within the cost cap         | تعذّر إكمال المهمة ضمن حد التكلفة                        | ok      |

## Verdicts

All Arabic is MSA (الفصحى). No dialect tokens. The routing chain label
"سلسلة الإسناد" is slightly formal but reads as standard Arabic; not
flagged.

LTR agent ids (e.g. `research`, `reading-helper`) are wrapped in `<bdi>`
inside the routing chain indicator to prevent bidi confusion when
rendered in Arabic sentences.
