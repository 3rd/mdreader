---
title: Diagrams
description: Mermaid diagrams supported by mdreader
order: 2
---

# Diagrams

mdreader renders Mermaid code fences in the browser. Diagrams follow the current light or dark theme, and readers can expand a diagram into a larger view with pan and zoom when they need more space.

## Flowchart

```mermaid
flowchart TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> E[Check logs]
    E --> F[Fix issue]
    F --> B
    C --> G[Deploy]
```

## Sequence Diagram

```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant Docs

    Client->>Server: GET /api/page/guides/installation.json
    Server->>Docs: Read markdown file
    Docs-->>Server: Parsed page data
    Server-->>Client: JSON response
```

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Loading: fetch
    Loading --> Success: data received
    Loading --> Error: request failed
    Success --> Loading: refresh
    Error --> Loading: retry
    Error --> Idle: dismiss
```

## Entity Relationship

```mermaid
erDiagram
    USER ||--o{ ORDER : places
    USER {
        string id PK
        string name
        string email
    }
    ORDER ||--|{ LINE_ITEM : contains
    ORDER {
        string id PK
        string user_id FK
        string status
    }
    PRODUCT ||--o{ LINE_ITEM : appears_in
    PRODUCT {
        string id PK
        string name
        float price
    }
```

## Pie Chart

```mermaid
pie title Language Distribution
    "TypeScript" : 45
    "Python" : 25
    "Rust" : 15
    "Go" : 10
    "Other" : 5
```

## Git Graph

```mermaid
gitGraph
    commit id: "init"
    commit id: "add readme"
    branch feature/auth
    commit id: "add login"
    commit id: "add signup"
    checkout main
    merge feature/auth id: "merge auth"
    commit id: "v1.0.0" tag: "v1.0.0"
```

## See also

- [Writing Content](/guides/writing-content)
- [CLI Reference](/reference/cli)
