// Generated from docs/master-data.md by scripts/parse-master-data.mjs.
// Do not hand-edit this file. Re-run the script after changing the master data.

export type MasterPlaza = {
  name: string;
  lengthKm: number;
  toll: string[];
  maintenance: string[];
  corridor: string[];
};

export type MasterProject = {
  name: string;
  code: string;
  state: string;
  round: 1 | 2 | 3 | 4;
  pms: string[];
  plazas: MasterPlaza[];
};

export type MasterCompany = {
  name: string;
  code: string;
  projects: MasterProject[];
};

export type MasterDepartment = {
  name: string;
  code: string;
  sortOrder: number;
};

export type MasterOffice = {
  name: string;
  city: string;
};

export const MASTER_COMPANIES: MasterCompany[] = [
  {
    "name": "NHIT Eastern Projects Private Limited",
    "code": "NEPPL",
    "projects": [
      {
        "name": "Kachugaon-Kalijhar",
        "code": "KRK",
        "state": "Assam",
        "round": 3,
        "pms": [
          "K Bala Subramaniyam"
        ],
        "plazas": [
          {
            "name": "Patagaon",
            "lengthKm": 62.6,
            "toll": [
              "Deo Narayan Raut"
            ],
            "maintenance": [
              "Bal Krishna Dubey"
            ],
            "corridor": [
              "Veerababu"
            ]
          },
          {
            "name": "Dhalapara",
            "lengthKm": 51.5,
            "toll": [
              "Ranjan"
            ],
            "maintenance": [
              "Prabhash Kumar"
            ],
            "corridor": [
              "Veerababu"
            ]
          }
        ]
      },
      {
        "name": "Rewa-Katni-Jabalpur-Lakhnadon",
        "code": "RKJL",
        "state": "Madhya Pradesh",
        "round": 3,
        "pms": [
          "M. Ravindran"
        ],
        "plazas": [
          {
            "name": "Odhaki",
            "lengthKm": 69.1,
            "toll": [
              "Arpit Gupta"
            ],
            "maintenance": [
              "Veeramani"
            ],
            "corridor": [
              "Kundan Kumar Gautam"
            ]
          },
          {
            "name": "Mohtara",
            "lengthKm": 88.07,
            "toll": [
              "Prathvi Rathi"
            ],
            "maintenance": [
              "Veeramani"
            ],
            "corridor": [
              "Kamal"
            ]
          },
          {
            "name": "Kherwasani",
            "lengthKm": 67.3,
            "toll": [
              "Manjit Yadav"
            ],
            "maintenance": [
              "Veeramani"
            ],
            "corridor": [
              "Kundan Kumar Gautam"
            ]
          },
          {
            "name": "Boharipar",
            "lengthKm": 81.7,
            "toll": [
              "Sunil Shukla"
            ],
            "maintenance": [
              "Veeramani"
            ],
            "corridor": []
          }
        ]
      },
      {
        "name": "Chichra-Kharagpur",
        "code": "CHK",
        "state": "West Bengal",
        "round": 3,
        "pms": [
          "Mintu Nandi"
        ],
        "plazas": [
          {
            "name": "Balibhasa",
            "lengthKm": 56.1,
            "toll": [
              "Sanjiv kumar Singh"
            ],
            "maintenance": [
              "Mintu Nandi"
            ],
            "corridor": [
              "Nripendra Dubey"
            ]
          }
        ]
      },
      {
        "name": "Orai-Bara",
        "code": "OB",
        "state": "Uttar Pradesh",
        "round": 3,
        "pms": [
          "Uttam Singh"
        ],
        "plazas": [
          {
            "name": "Usaka",
            "lengthKm": 62.9,
            "toll": [
              "Ankesh Kumar"
            ],
            "maintenance": [],
            "corridor": [
              "Inglesh"
            ]
          }
        ]
      },
      {
        "name": "Lakhnadon-Khawasa",
        "code": "LK",
        "state": "Madhya Pradesh",
        "round": 3,
        "pms": [
          "M. Ravindran"
        ],
        "plazas": [
          {
            "name": "Madai",
            "lengthKm": 107.3,
            "toll": [
              "Rachit Agarwal"
            ],
            "maintenance": [
              "Avinish Tiwari"
            ],
            "corridor": [
              "Vipi Singh"
            ]
          },
          {
            "name": "Khawasa",
            "lengthKm": 107.3,
            "toll": [
              "Hemant Kumar Rajput"
            ],
            "maintenance": [
              "Avinish Tiwari"
            ],
            "corridor": [
              "Vipi Singh"
            ]
          }
        ]
      },
      {
        "name": "Hubli-Haveri-Chitradurga",
        "code": "HHC",
        "state": "Karnataka",
        "round": 3,
        "pms": [
          "Suresh Shankar Narayana"
        ],
        "plazas": [
          {
            "name": "Bankapur",
            "lengthKm": 214.3,
            "toll": [
              "Matam Santosh"
            ],
            "maintenance": [],
            "corridor": []
          },
          {
            "name": "Chalageri",
            "lengthKm": 214.3,
            "toll": [
              "C Kesvareddy"
            ],
            "maintenance": [],
            "corridor": []
          },
          {
            "name": "Hebbalu",
            "lengthKm": 214.3,
            "toll": [
              "Raja shekhar"
            ],
            "maintenance": [],
            "corridor": []
          }
        ]
      },
      {
        "name": "Kalijhar-Patacharkuchi",
        "code": "KP",
        "state": "Assam",
        "round": 3,
        "pms": [
          "K Bala Subramaniyam"
        ],
        "plazas": [
          {
            "name": "Galia",
            "lengthKm": 27.3,
            "toll": [
              "Ravi Dubey"
            ],
            "maintenance": [
              "Bal Krishna Dubey"
            ],
            "corridor": [
              "Veerababu"
            ]
          }
        ]
      }
    ]
  },
  {
    "name": "NHIT Southern Projects Private Limited",
    "code": "NSPPL",
    "projects": [
      {
        "name": "Narasannapeta-Ranasthalam",
        "code": "NR",
        "state": "Andhra Pradesh",
        "round": 4,
        "pms": [
          "Krishna Rao"
        ],
        "plazas": [
          {
            "name": "Madapam",
            "lengthKm": 53.79,
            "toll": [
              "Ravella Satish Babu"
            ],
            "maintenance": [],
            "corridor": []
          }
        ]
      },
      {
        "name": "Ranasthalam to Hanumanthvaka",
        "code": "RH",
        "state": "Andhra Pradesh",
        "round": 4,
        "pms": [
          "Krishna Rao"
        ],
        "plazas": [
          {
            "name": "Nathavalasa",
            "lengthKm": 66.5,
            "toll": [
              "Ravi Babu"
            ],
            "maintenance": [],
            "corridor": []
          }
        ]
      },
      {
        "name": "Anandapuram-Pendurthi-Anakapalle",
        "code": "APA",
        "state": "Andhra Pradesh",
        "round": 4,
        "pms": [
          "Krishna Rao"
        ],
        "plazas": [
          {
            "name": "Marripalem",
            "lengthKm": 48.6,
            "toll": [
              "Bodireddy Pydiraju"
            ],
            "maintenance": [],
            "corridor": []
          },
          {
            "name": "Dukkavanipalem",
            "lengthKm": 48.6,
            "toll": [
              "Tej Kumar"
            ],
            "maintenance": [],
            "corridor": []
          }
        ]
      },
      {
        "name": "Gundugolanu Devarapalli Kovvur",
        "code": "GDK",
        "state": "Andhra Pradesh",
        "round": 4,
        "pms": [
          "Krishna Rao"
        ],
        "plazas": [
          {
            "name": "Veeravalli",
            "lengthKm": 70,
            "toll": [
              "Samarla Ramesh"
            ],
            "maintenance": [],
            "corridor": [
              "Bukka Giri"
            ]
          }
        ]
      },
      {
        "name": "Chittoor-Mallavaram",
        "code": "CM",
        "state": "Andhra Pradesh",
        "round": 4,
        "pms": [],
        "plazas": [
          {
            "name": "Gadnaki",
            "lengthKm": 61.128,
            "toll": [
              "Senthil Kumar"
            ],
            "maintenance": [],
            "corridor": []
          }
        ]
      },
      {
        "name": "AP/TN Border to Nalagampalli, AP/Karnataka Border Section",
        "code": "APTNK",
        "state": "Andhra Pradesh",
        "round": 4,
        "pms": [
          "Krishna Rao"
        ],
        "plazas": [
          {
            "name": "Mahasamudram",
            "lengthKm": 84.79,
            "toll": [
              "Griddaluru V.M.B. Krishnachaitanya"
            ],
            "maintenance": [
              "Kukuniri Subhramanya Kiran Kumar"
            ],
            "corridor": [
              "Bukka Giri"
            ]
          }
        ]
      },
      {
        "name": "Bareilly-Sitapur",
        "code": "BS",
        "state": "Uttar Pradesh",
        "round": 4,
        "pms": [
          "Anjani Kumar"
        ],
        "plazas": [
          {
            "name": "Faridpur",
            "lengthKm": 157.59,
            "toll": [
              "Kasam Khan"
            ],
            "maintenance": [
              "Satendra Singh"
            ],
            "corridor": [
              "Mohit Pandey"
            ]
          },
          {
            "name": "Maigalganj",
            "lengthKm": 157.59,
            "toll": [
              "Brijesh"
            ],
            "maintenance": [
              "Satendra Singh"
            ],
            "corridor": [
              "Mohit Pandey"
            ]
          }
        ]
      },
      {
        "name": "Muzaffarnagar-Haridwar",
        "code": "MH",
        "state": "Uttar Pradesh / Uttarakhand",
        "round": 4,
        "pms": [
          "M Santosh Kumar"
        ],
        "plazas": [
          {
            "name": "Bahadrabad",
            "lengthKm": 78.56,
            "toll": [
              "Jaldeep Singh"
            ],
            "maintenance": [
              "Arjun Singh"
            ],
            "corridor": [
              "PB Chamoli"
            ]
          },
          {
            "name": "Chapar",
            "lengthKm": 78.56,
            "toll": [
              "Azad Sharma"
            ],
            "maintenance": [
              "Arjun Singh"
            ],
            "corridor": [
              "PB Chamoli"
            ]
          }
        ]
      },
      {
        "name": "Raipur-Simga",
        "code": "RS",
        "state": "Chhattisgarh",
        "round": 4,
        "pms": [
          "Kuldeep Singh"
        ],
        "plazas": [
          {
            "name": "Tarpongi",
            "lengthKm": 48.5,
            "toll": [
              "Binayak Dhal"
            ],
            "maintenance": [
              "Puddu Venkat Santosh Kumar"
            ],
            "corridor": [
              "Vinay Pandey",
              "Nikhil Ranjan"
            ]
          }
        ]
      },
      {
        "name": "Simga-Bilaspur",
        "code": "SB",
        "state": "Chhattisgarh",
        "round": 4,
        "pms": [
          "Kuldeep Singh"
        ],
        "plazas": [
          {
            "name": "Bhojpuri",
            "lengthKm": 77.94,
            "toll": [
              "Naresh"
            ],
            "maintenance": [
              "Puddu Venkat Santosh Kumar"
            ],
            "corridor": [
              "Vinay Pandey",
              "Nikhil Ranjan"
            ]
          },
          {
            "name": "Mudipar",
            "lengthKm": 77.94,
            "toll": [
              "Pallav Kumar Jha"
            ],
            "maintenance": [
              "Puddu Venkat Santosh Kumar"
            ],
            "corridor": [
              "Vinay Pandey",
              "Nikhil Ranjan"
            ]
          }
        ]
      },
      {
        "name": "Gandhidham-Mundra Port",
        "code": "GMP",
        "state": "Gujarat",
        "round": 4,
        "pms": [
          "Krishna Rao"
        ],
        "plazas": [
          {
            "name": "Mokha",
            "lengthKm": 71.4,
            "toll": [
              "Rajesh Patel"
            ],
            "maintenance": [],
            "corridor": []
          }
        ]
      }
    ]
  },
  {
    "name": "NHIT Western Projects Private Limited",
    "code": "NWPPL",
    "projects": [
      {
        "name": "Abu Road-Swaroopganj",
        "code": "AS",
        "state": "Gujarat",
        "round": 1,
        "pms": [
          "Shailendrasinh Rajput"
        ],
        "plazas": [
          {
            "name": "Undvariya",
            "lengthKm": 31,
            "toll": [
              "Vikas"
            ],
            "maintenance": [
              "Shreejit Nair"
            ],
            "corridor": [
              "Bipin Mevada"
            ]
          }
        ]
      },
      {
        "name": "Palanpur-Abu Road",
        "code": "PA",
        "state": "Rajasthan",
        "round": 1,
        "pms": [
          "Shailendrasinh Rajput"
        ],
        "plazas": [
          {
            "name": "Khemana",
            "lengthKm": 45,
            "toll": [
              "Raghubhir Singh"
            ],
            "maintenance": [
              "Shreejit Nair"
            ],
            "corridor": [
              "Bipin Mevada"
            ]
          }
        ]
      },
      {
        "name": "Belgaum-Karnataka Border",
        "code": "BK",
        "state": "Karnataka",
        "round": 1,
        "pms": [
          "M. Ravindran"
        ],
        "plazas": [
          {
            "name": "Hattargi",
            "lengthKm": 78,
            "toll": [
              "Gauri Soma Naidu"
            ],
            "maintenance": [],
            "corridor": []
          },
          {
            "name": "Kognoli",
            "lengthKm": 78,
            "toll": [
              "Gauri Soma Naidu"
            ],
            "maintenance": [],
            "corridor": []
          }
        ]
      },
      {
        "name": "Chittorgarh-Kota",
        "code": "CK",
        "state": "Rajasthan",
        "round": 1,
        "pms": [
          "Manish Srivastava"
        ],
        "plazas": [
          {
            "name": "Aroli",
            "lengthKm": 160.5,
            "toll": [
              "Kuldeep"
            ],
            "maintenance": [
              "Yogesh Kumar"
            ],
            "corridor": [
              "Rajendra Raval"
            ]
          },
          {
            "name": "Bassi",
            "lengthKm": 160.5,
            "toll": [
              "Dharmendra Singh"
            ],
            "maintenance": [
              "Yogesh Kumar"
            ],
            "corridor": [
              "Rajendra Raval"
            ]
          },
          {
            "name": "Dhaneshwar",
            "lengthKm": 160.5,
            "toll": [
              "Arun Sharma"
            ],
            "maintenance": [
              "Yogesh Kumar"
            ],
            "corridor": [
              "Rajendra Raval"
            ]
          }
        ]
      },
      {
        "name": "Agra-Bypass",
        "code": "AB",
        "state": "Uttar Pradesh",
        "round": 2,
        "pms": [
          "Rohit Kumar"
        ],
        "plazas": [
          {
            "name": "Raibha",
            "lengthKm": 32.8,
            "toll": [
              "Ishwar Sharma"
            ],
            "maintenance": [
              "Rohit Kumar"
            ],
            "corridor": [
              "Deepak Sharma"
            ]
          }
        ]
      },
      {
        "name": "Shivpuri-Jhansi",
        "code": "SJ",
        "state": "Madhya Pradesh",
        "round": 2,
        "pms": [
          "Ranjay Singh"
        ],
        "plazas": [
          {
            "name": "Raksha",
            "lengthKm": 75.3,
            "toll": [
              "Sandeep Bhadana"
            ],
            "maintenance": [
              "Arif Shakoor"
            ],
            "corridor": [
              "Nitish Bahuguna"
            ]
          }
        ]
      },
      {
        "name": "Borkhedi-Wadner-Deodhari-Kelapur",
        "code": "BW",
        "state": "Maharashtra",
        "round": 2,
        "pms": [
          "Amit Rana"
        ],
        "plazas": [
          {
            "name": "Daroda",
            "lengthKm": 138.4,
            "toll": [
              "Malkeet Singh"
            ],
            "maintenance": [],
            "corridor": [
              "Bhanu Pratap Singh"
            ]
          },
          {
            "name": "Kelapur",
            "lengthKm": 138.4,
            "toll": [
              "Neeraj Ramyani"
            ],
            "maintenance": [],
            "corridor": [
              "Bhanu Pratap Singh"
            ]
          }
        ]
      },
      {
        "name": "Kothkota Kurnool",
        "code": "KK",
        "state": "Telangana",
        "round": 1,
        "pms": [
          "Sreedhar"
        ],
        "plazas": [
          {
            "name": "Pullur",
            "lengthKm": 74.62,
            "toll": [
              "Sreedhar"
            ],
            "maintenance": [
              "Unam Rajesh"
            ],
            "corridor": [
              "M D Samiulla"
            ]
          }
        ]
      },
      {
        "name": "Amravati-Chikhali-Tarsod",
        "code": "ACT",
        "state": "Maharashtra",
        "round": 1,
        "pms": [
          "Vivek Choudhary"
        ],
        "plazas": [
          {
            "name": "Tarod Kasba",
            "lengthKm": 73,
            "toll": [
              "Anand Mandoli"
            ],
            "maintenance": [],
            "corridor": []
          },
          {
            "name": "Dasarkhed",
            "lengthKm": 45,
            "toll": [
              "Sachin Choudhary"
            ],
            "maintenance": [],
            "corridor": []
          },
          {
            "name": "Kurankhed",
            "lengthKm": 76,
            "toll": [
              "Vikrant"
            ],
            "maintenance": [],
            "corridor": []
          },
          {
            "name": "Nashirabad",
            "lengthKm": 62.7,
            "toll": [
              "Omvir Singh"
            ],
            "maintenance": [],
            "corridor": []
          }
        ]
      },
      {
        "name": "Gundugolanu-Chinna Avutapalli",
        "code": "GCA",
        "state": "Andhra Pradesh",
        "round": 1,
        "pms": [
          "Kiran Kumar"
        ],
        "plazas": [
          {
            "name": "Kalaparru",
            "lengthKm": 54.4,
            "toll": [
              "Panduranga Raju"
            ],
            "maintenance": [
              "Satyapal Sopanrao Vaidya"
            ],
            "corridor": [
              "Teja Swaroop"
            ]
          }
        ]
      }
    ]
  }
];

export const MASTER_DEPARTMENTS: MasterDepartment[] = [
  {
    "name": "Admin",
    "code": "ADMIN",
    "sortOrder": 1
  },
  {
    "name": "BMS",
    "code": "BMS",
    "sortOrder": 4
  },
  {
    "name": "EHS",
    "code": "EHS",
    "sortOrder": 5
  },
  {
    "name": "Finance & Accounts",
    "code": "FIN",
    "sortOrder": 6
  },
  {
    "name": "HR - Learning & Development",
    "code": "HR-LD",
    "sortOrder": 7
  },
  {
    "name": "HR-Compliance",
    "code": "HR-COMP",
    "sortOrder": 8
  },
  {
    "name": "HR-Recruitment & Payroll",
    "code": "HR-RP",
    "sortOrder": 9
  },
  {
    "name": "Initial Improvement/MMR",
    "code": "MMR",
    "sortOrder": 10
  },
  {
    "name": "Internal Audit",
    "code": "IA",
    "sortOrder": 11
  },
  {
    "name": "Investment & Acquisitions",
    "code": "INV",
    "sortOrder": 12
  },
  {
    "name": "IT",
    "code": "IT",
    "sortOrder": 13
  },
  {
    "name": "ITS",
    "code": "ITS",
    "sortOrder": 14
  },
  {
    "name": "Legal",
    "code": "LEGAL",
    "sortOrder": 15
  },
  {
    "name": "Maintenance",
    "code": "MAINT",
    "sortOrder": 16
  },
  {
    "name": "Operations",
    "code": "OPS",
    "sortOrder": 17
  },
  {
    "name": "Procurement",
    "code": "PROC",
    "sortOrder": 18
  },
  {
    "name": "Secretarial",
    "code": "SEC",
    "sortOrder": 19
  },
  {
    "name": "Treasury",
    "code": "TREAS",
    "sortOrder": 20
  }
];

export const MASTER_OFFICES: MasterOffice[] = [
  {
    "name": "Delhi",
    "city": "Delhi"
  },
  {
    "name": "Mumbai",
    "city": "Mumbai"
  }
];
