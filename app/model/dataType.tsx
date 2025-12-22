// /types/firestoreTypes.ts
export interface Company {
  userId: string;
  _companyType: string;
  _companySize: string;
  _companyLocation: string;
  _companyDescription: string;
}

export interface Education {
  userId: string;
  academic_result: string;
  education_level: string;
  field_of_study: string;
  university: string;
}

export type CareerProfile = {
  id: string;
  interests: string[];
  personality: string;
  skills: string[];
  userId: string;
};

export interface jobs {
  job_id: string;
  company_name: string;
  job_description: string;
  job_location: string;
  job_name: string;
  job_salary: number;
  job_type: string;
  company_logo?: string;
  job_skill_set: string[];
  job_skill_coursera?: string[];
  company_id: string;
}

export type courses = {
  course_id: string;
  course_title: string;
  course_link: string;
  course_description: string;
  course_image: string;
  provider_names?: string[];
  domains?: string[];
  subdomains?: string[];
  coursera_skills?: string[];
  course_level?: string;
};

export interface jobApplied {
  jobApplied_id: string;
  jobId: string;
  userId: string;
  status: string;
  jobDetails?: jobs;
}

export interface courseRegister {
  course_id: string;
  courseRegister_id: string;
  userId: string;
  courseDetails?: courses;
  courseStatus: string;
  course_title: string;
  completedAt: string;
  provider_names?: string[];
}
