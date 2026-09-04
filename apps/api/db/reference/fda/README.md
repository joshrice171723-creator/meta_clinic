# FDA NDC reference snapshot

ndctext.zip is the FDA's current text-format NDC database snapshot downloaded
on 2026-09-04 from:

https://www.accessdata.fda.gov/cder/ndctext.zip

The archive contains:

- product.txt for product-level metadata
- package.txt for package-level NDC descriptions

The package NDC is the exact identifier used for catalog selection. Preserve
the values as strings, including leading zeroes and hyphens.

This snapshot is a checked-in reference for field mapping and verification. The
catalog lookup continues to use the server-side openFDA API so searches do not
depend on shipping the full text files into each request. A scheduled refresh
can replace this snapshot and update a local index in a later change.

FDA directory data is submitted by labelers and is not an FDA approval
determination. Clinic staff must select the exact package and confirm the
clinic-owned stock and purchasing fields before saving.
