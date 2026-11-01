# Seed-san: source and licence metadata (metadata-only)

Related issue: heytylo-png/star-app-2-live #179. Research reference only.

This document separates records that were *reported* by earlier work from facts that were *independently verified* by BlendBro. Where a value could not be confirmed as verified, it is listed under "Reported records" only.

## Reported records (not independently re-verified)

| Value | Reported value | Where it came from |
|---|---|---|
| Source repository | `vrm-c/vrm-specification` | `source.txt` (in the Seed-san research folder) |
| Pinned commit | `94e82dd346fa6cf0337c4421728640e5252dd38e` | `source.txt` |
| Path | `samples/Seed-san/vrm/Seed-san.vrm` | `source.txt` (inside the URL) and Texture Bro's records |
| Source URL | `https://raw.githubusercontent.com/vrm-c/vrm-specification/94e82dd346fa6cf0337c4421728640e5252dd38e/samples/Seed-san/vrm/Seed-san.vrm` | `source.txt` |
| ETag | `1e3d958c917c25e8b238329bfebb24dd7c79c78da2f6fb6aae92a81c484db086` | HEAD-request record in the verification notes, `/workspace/research/reflib_v1/seed-san/claude_review_package/4_verification/VERIFICATION.md`. It is NOT in the original source record (`source.txt`). |
| File size | 10,917,800 bytes | Same HEAD-request record in `VERIFICATION.md` (also the length declared in the GLB header, see below). Not in `source.txt`. |
| Accept-Ranges | `bytes` | Same HEAD-request record in `VERIFICATION.md`. Not in `source.txt`. |
| Byte range 0-19 | GLB header, 20 bytes | Texture Bro's metadata-only retrieval record (2026-10-31, 20:50 CT), also recorded in `VERIFICATION.md` |
| Byte range 20-134,755 | JSON chunk, 134,736 bytes | Same records |
| SHA-256 of bytes 0-19 | `79331aa2318b0c347063f997f630fa463dc0a665ae6b24e32b1356176d5df964` | Same records |
| SHA-256 of bytes 20-134,755 | `00d021d13140655972dcf134cad6464b6c4756fd3e262e989e0feb01eed81652` | Same records |
| Licence fields | see "Licence metadata" below | `license_meta.json`, extracted by Texture Bro |

## Independently verified by BlendBro (local files only)

Verification was done on the box, on 2026-10-31, by re-hashing and reading the already-saved fragment files. Nothing was re-fetched from the source.

- The saved header fragment `hdr.bin` is 20 bytes and hashes to `79331aa2318b0c347063f997f630fa463dc0a665ae6b24e32b1356176d5df964`, matching the reported hash for bytes 0-19.
- The saved JSON-chunk fragment `json_chunk.json` is 134,736 bytes and hashes to `00d021d13140655972dcf134cad6464b6c4756fd3e262e989e0feb01eed81652`, matching the reported hash for bytes 20-134,755.
- Reading the 20 header bytes gives: magic `glTF`, container version 2, declared total length 10,917,800, first chunk length 134,736.
- `source.txt` contains the pinned commit `94e82dd346fa6cf0337c4421728640e5252dd38e` and the source URL above.
- The licence values below match `license_meta.json` as saved.

**Not verified by BlendBro:** that the saved fragments are really bytes 0-19 and 20-134,755 of the upstream file; the ETag, the file size and Accept-Ranges against the live source; the pinned commit and path against upstream; and the full-file hashes (not published here). No re-fetch from the source was done.

## Licence metadata (from `license_meta.json`)
- Licence URL: https://vrm.dev/licenses/1.0/ (VRM Public License 1.0)
- Author: VirtualCast, Inc.
- Copyright information: VirtualCast, Inc.
- Avatar permission: `everyone`
- Commercial usage: `corporation`
- Credit notation: `required`
- Redistribution (`allowRedistribution`): true
- Modification: `allowModificationRedistribution`
- Use flags: allowExcessivelySexualUsage = true; allowExcessivelyViolentUsage = true; allowPoliticalOrReligiousUsage = true; allowAntisocialOrHateUsage = true

## Attribution requirement
Credit is required. Any shared work derived from Seed-san must credit "VirtualCast, Inc."

## Scope statement
The original approval was metadata-only (GLB header and JSON chunk, licence fields only). A later full download and study exceeded that scope. The findings from that study are withheld from publication pending a separate decision. This document does not retroactively authorize anything.

## Not included
- Claude's review was not located and is not included.
- The model file, the JSON chunk, the header bytes, the licence JSON, images, and all findings from the expanded study are not included.

## Use restrictions (project rules)
No AI training. No redistribution. No production use. A licence label alone does not grant approval for these uses; this is not production approval.
