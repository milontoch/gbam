---
title: "How to Reduce a Photo to Under 100 KB"
description: "A step-by-step way to shrink a photo for a portal or form, with real file-size results at different widths and quality settings."
tool: compress-image
published: 2026-10-22
updated: 2026-10-22
draft: false
---

Many online forms and portals reject a photo with "file too large" or ask for an image under 100 KB, 200 KB or 500 KB. A photo straight from a modern phone is usually several megabytes, so it has to be made much smaller first. This guide shows a simple way to do that on your phone, and what to change if the first try is not small enough.

## The short answer

1. Open the [Compress Image tool](/compress-image) and choose your photo.
2. Set **Maximum width** to **1200 px** and **Quality** to **60**.
3. Download the result and check its size.

In our test, that gave a file just over 100 KB. If yours is still too big, lower the width to **800 px**, which comes out a lot smaller. The details and the numbers are below.

## Why two settings matter

A photo's file size depends mostly on two things:

- **How many pixels it has.** A photo that is 4000 pixels wide holds far more detail than one that is 1200 pixels wide, and that detail costs size. Screens and web forms rarely need more than 1200 to 1600 pixels.
- **How strongly it is compressed (quality).** Lower quality throws away fine detail that most people cannot see at normal size, so the file shrinks.

Lowering the width usually saves more than lowering the quality, and it does less visible damage. So change the width first, then quality.

## What we measured

We ran the tool on one portrait photo that was 1920 × 2400 pixels and 788 KB. These are real results from the Compress Image tool, saved as JPEG. The columns are the **Quality** setting, and the rows are the **Maximum width**:

| Width \ Quality | 80 | 70 | 60 | 50 |
|---|---|---|---|---|
| 1600 px | 327 KB | 228 KB | 174 KB | 143 KB |
| 1200 px | 186 KB | 132 KB | 104 KB | 87 KB |
| 800 px | 78 KB | 60 KB | 49 KB | 43 KB |

Your photo will behave differently. A plain, well-lit photo compresses more than a busy or dark one with lots of grain, so treat this table as a guide to the pattern, not a promise. Use it to decide which way to move: smaller width first, then lower quality.

## Step by step on your phone

1. Open the Compress Image tool in your phone's browser (Chrome, Safari or similar).
2. Tap the box and choose the photo from your gallery, or take a new one.
3. Under **Maximum width**, pick **1200 px** (or **800 px** if the limit is small).
4. Move the **Quality** slider to about **60**. The result updates by itself.
5. Check the size shown next to your photo, for example "788 KB → 104 KB".
6. Tap **Download**. On most phones the file goes to your **Downloads** folder.

Your photo is processed inside your browser. It is not uploaded to us.

## How to check the size of the downloaded file

Open your phone's **Files** app, go to **Downloads**, and open the file's details (on iPhone, press and hold the file and choose **Get Info**; on Android, open the file's menu and choose **Details** or **File info**). It shows the size in KB or MB.

## If it is still too big or too blurry

- **Still over the limit:** lower the maximum width to 800 px, then lower quality in small steps of 5 to 10.
- **The photo looks blurry or blocky:** you have gone too far. Raise the quality again, or use a slightly larger width.
- **The form wants exact pixel dimensions** (for example 600 × 800): use the [Resize Image tool](/resize-image) first, then compress.
- **It is a photo of a document with small text:** keep the width at 1200 px or more and the quality at 70 or higher, so the writing stays readable.
- **It is a passport photo:** the [Passport Photo Maker](/passport-photo-maker) crops to the right size and can keep the file under a limit for you.

## Common questions

**Is JPEG or PNG better for this?** JPEG is far better for photographs. A PNG of the same photo is usually much larger. The tool saves JPEG by default for that reason.

**Will compressing damage my original?** No. The tool makes a new, smaller copy. Your original photo stays untouched.

**Can I compress several photos at once?** Yes, you can pick up to 20 at a time, and the same settings apply to all of them.
