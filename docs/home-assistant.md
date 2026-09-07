# Adding items by voice (Home Assistant)

The app exposes `POST /api/quick-add` for external callers:

```
POST https://list.example.com/api/quick-add
Authorization: Bearer <LIST_API_TOKEN>
Content-Type: application/json

{ "name": "milk" }            # optional: "place": "<place id>" to add to one store's list only
```

`LIST_API_TOKEN` is set in `list.env` (and injected into the container). Test:

```sh
curl -X POST https://list.example.com/api/quick-add \
  -H "Authorization: Bearer $LIST_API_TOKEN" \
  -H 'content-type: application/json' -d '{"name":"paper towels"}'
```

## Stage 1 — REST command + a custom sentence (works with Voice PE today)

`configuration.yml`:

```yaml
rest_command:
  list_add:
    url: https://list.example.com/api/quick-add
    method: POST
    headers:
      authorization: !secret list_api_token          # "Bearer xxxxx"
      content-type: application/json
    payload: '{"name": "{{ item }}"}'

intent_script:
  AddToGroceryList:
    speech:
      text: "Added {{ item }} to the list."
    action:
      - service: rest_command.list_add
        data:
          item: "{{ item }}"
```

`custom_sentences/en/list.yaml`:

```yaml
language: en
intents:
  AddToGroceryList:
    data:
      - sentences:
          - "add {item} to [the] (grocery|shopping) list"
          - "put {item} on [the] (grocery|shopping) list"
lists:
  item:
    wildcard: true
```

Restart HA, then say to the Voice PE: **"add milk to the grocery list."**

## Stage 2 — native to-do entity (later)

A small custom integration can expose the list as a Home Assistant `todo` entity
(`async_create_todo_item` / `async_get_todo_items`, feature `TodoListEntityFeature.CREATE_TODO_ITEM`),
backed by `GET`/`POST` against the sync API. Then HA's built-in "add X to the list"
sentence works with no custom sentences, and the list shows on HA dashboards.
There's a community HACS integration that does exactly this for another list app —
use it as a template.
