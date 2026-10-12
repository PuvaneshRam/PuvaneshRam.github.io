// Managed by admin.html, which rewrites this file on Save. Hand edits work too,
// but comments added here are lost the next time the admin page saves.
//
// Each post: slug (unique across both lists), title, category, cover (the card
// thumbnail, one of the images), media [] in display order: {type: 'image' | 'video' | '3d', src}
// (src is a file path, or the Sketchfab model ID for '3d'). Optional: description,
// software [], postedDate, stats {reactions, views, comments}, artstationUrl.

// Personal Work screen
const PERSONAL_WORK = [
  {
    "slug": "project-01",
    "title": "Project Title 01",
    "category": "Category / Software",
    "cover": "assets/work/project-01/cover.jpg",
    "media": [
      {
        "type": "image",
        "src": "assets/work/project-01/cover.jpg"
      },
      {
        "type": "video",
        "src": "assets/work/project-01/preview.mp4"
      }
    ],
    "artstationUrl": "https://puvaneshramr1.artstation.com/"
  },
  {
    "slug": "project-02",
    "title": "Project Title 02",
    "category": "Category / Software",
    "cover": "assets/work/project-02/cover.jpg",
    "media": [
      {
        "type": "image",
        "src": "assets/work/project-02/cover.jpg"
      }
    ],
    "artstationUrl": "https://puvaneshramr1.artstation.com/"
  },
  {
    "slug": "project-03",
    "title": "Project Title 03",
    "category": "Category / Software",
    "cover": "assets/work/project-03/cover.jpg",
    "media": [
      {
        "type": "image",
        "src": "assets/work/project-03/cover.jpg"
      },
      {
        "type": "video",
        "src": "assets/work/project-03/preview.mp4"
      },
      {
        "type": "3d",
        "src": "REPLACE_WITH_SKETCHFAB_MODEL_ID"
      }
    ],
    "artstationUrl": "https://puvaneshramr1.artstation.com/"
  }
];

// Projects screen
const PROJECT_ITEMS = [
  {
    "slug": "interior-design",
    "title": "Interior Design",
    "category": "Interior Render / Blender",
    "description": "Interior Render For my Freelance project. I hope you people like it.",
    "software": [
      "Blender"
    ],
    "postedDate": "Posted 11 months ago",
    "stats": {
      "reactions": 3,
      "views": 23,
      "comments": 0
    },
    "cover": "assets/projects/interior-design/cover.webp",
    "media": [
      {
        "type": "image",
        "src": "assets/projects/interior-design/cover.webp"
      },
      {
        "type": "image",
        "src": "assets/projects/interior-design/gallery-1.webp"
      },
      {
        "type": "image",
        "src": "assets/projects/interior-design/gallery-2.webp"
      },
      {
        "type": "image",
        "src": "assets/projects/interior-design/gallery-3.webp"
      },
      {
        "type": "image",
        "src": "assets/projects/interior-design/gallery-4.webp"
      },
      {
        "type": "image",
        "src": "assets/projects/interior-design/gallery-5.webp"
      },
      {
        "type": "image",
        "src": "assets/projects/interior-design/gallery-6.webp"
      },
      {
        "type": "image",
        "src": "assets/projects/interior-design/gallery-7.webp"
      },
      {
        "type": "image",
        "src": "assets/projects/interior-design/gallery-8.webp"
      }
    ],
    "artstationUrl": "https://puvaneshramr1.artstation.com/"
  }
];
