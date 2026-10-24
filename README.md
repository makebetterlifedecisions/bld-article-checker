# BLD article checker

Read-only Playwright checks of public Better Life Decisions articles. Produces measured desktop/mobile layouts and screenshots for review. No Shopify credentials or write operations.

A passing automated assertion run is not a full editorial or visual approval. ChatGPT must inspect screenshots and complete retailer/product checks before issuing the full-article tick.

The workflow runs on checker or article-url.txt changes and can also be dispatched manually. Change the first line of article-url.txt to select an article; change the request comment to recheck the same URL. Reports and screenshots are uploaded as a GitHub Actions artifact.
