# Reference Search Protocol (High-Signal Sources)

## Source priority order

1. Apple Developer Documentation (`developer.apple.com/documentation`)
2. Apple WWDC sessions and sample code
3. Swift Evolution proposals / official Swift.org docs (language behavior)
4. Maintained library docs + repository READMEs (only when Apple APIs are insufficient)

## Query templates

Use targeted queries with the API name and platform/version context.

- `site:developer.apple.com/documentation SwiftUI @Observable`
- `site:developer.apple.com/documentation SwiftData ModelActor`
- `site:developer.apple.com/documentation XCTest async test`
- `site:developer.apple.com/documentation "privacy manifest" iOS`
- `site:developer.apple.com/documentation SwiftUI Liquid Glass`
- `site:developer.apple.com wwdc SwiftUI [topic]`

## Quality filter before trusting a source

- Is it official or well-maintained?
- Is it recent enough for the active Xcode/iOS target?
- Does it match SwiftUI (not UIKit-only) when SwiftUI is required?
- Does it cover concurrency/isolation implications?
- Does it include migration/availability guidance?

## How to cite references in agent output

For each important claim, include:

- source title
- source type (Apple doc, WWDC, Swift.org, library docs)
- why it applies to this exact task

Prefer fewer high-quality references over many low-signal links.
