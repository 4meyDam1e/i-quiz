import asyncHandler from "express-async-handler";
import formatMessage from "../utils/utils.js";
import Quiz from "../models/Quiz.js";
import MCQ from "../models/MCQ.js";
import MSQ from "../models/MSQ.js";
import CLO from "../models/CLO.js";
import OEQ from "../models/OEQ.js";
import User from "../models/User.js";
import Course from "../models/Course.js";

//@route  POST api/quizzes
//@desc   Allow instructor to create a quiz
//@access Private
const createQuiz = asyncHandler(async (req, res) => {
  const { quizName, startTime, endTime, course, questions } = req.body;

  //Check if valid user
  try {
    const instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user"));
  }

  //Verify all fields exist
  if (!quizName || !startTime || !endTime || !course || !questions) {
    return res.status(400).json(formatMessage(false, "Missing fields"));
  }

  //Verify valid course
  let courseToAddTo;
  try {
    courseToAddTo = await Course.findById(course);
    if (!courseToAddTo) {
      return res.status(400).json(formatMessage(false, "Invalid course id"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding course"));
  }

  //Convert startTime and endTime to Date objects
  const startTimeConverted = new Date(startTime);
  const endTimeConverted = new Date(endTime);

  //Verify startTime and endTime are valid dates and startTime is before endTime
  if (
    isNaN(startTimeConverted) ||
    isNaN(endTimeConverted) ||
    startTime >= endTime
  ) {
    return res
      .status(400)
      .json(formatMessage(false, "Invalid start and/or end time"));
  }

  //Check if there is a pre-existing quiz
  try {
    const existingQuiz = await Quiz.findOne({
      $and: [{ quizName: quizName }, { course: course }],
    });
    if (existingQuiz) {
      return res.status(400).json(formatMessage(false, "Quiz already exists"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding existing quiz"));
  }

  //Quiz questions
  const quizQuestions = [];

  //Create questions
  for (let i = 0; i < questions.length; i++) {
    let createdQuestion;
    try {
      switch (questions[i].type) {
        case "MCQ":
          const validMCQChoices = questions[i].question.choices.every(
            (choice) => choice.id && choice.content
          );
          if (!validMCQChoices) {
            return res
              .status(400)
              .json(formatMessage(false, "Invalid choices in MCQ question"));
          }
          createdQuestion = await MCQ.create(questions[i].question);
          break;
        case "MSQ":
          const validMSQChoices = questions[i].question.choices.every(
            (choice) => choice.id && choice.content
          );
          if (!validMSQChoices) {
            return res
              .status(400)
              .json(formatMessage(false, "Invalid choices in MSQ question"));
          }
          createdQuestion = await MSQ.create(questions[i].question);
          break;
        case "CLO":
          createdQuestion = await CLO.create(questions[i].question);
          break;
        case "OEQ":
          createdQuestion = await OEQ.create(questions[i].question);
          break;
        default:
          return res
            .status(400)
            .json(
              formatMessage(
                false,
                `Invalid question type ${questions[i].type}`
              )
            );
      }
    } catch (error) {
      return res
        .status(400)
        .json(formatMessage(false, "Mongoose error creating question"));
    }

    if (!createdQuestion) {
      return res
        .status(400)
        .json(formatMessage(false, "Question creation failed"));
    } else {
      quizQuestions.push({
        question: createdQuestion._id,
        type: questions[i].type,
      });
    }
  }

  //Create quiz
  const quiz = await Quiz.create({
    quizName: quizName,
    startTime: startTimeConverted,
    endTime: endTimeConverted,
    course: course,
    questions: quizQuestions,
  });
  if (quiz) {
    courseToAddTo.quizzes.push(quiz._id);
    await courseToAddTo.save();
    return res
      .status(201)
      .json(formatMessage(true, "Quiz created successfully", quiz));
  } else {
    return res.status(400).json(formatMessage(false, "Quiz creation failed"));
  }
});

//@route  GET api/quizzes/:quizId
//@desc   Allow instructor get a specific quiz
//@access Private
const getQuiz = asyncHandler(async (req, res) => {
  //Check if valid user
  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user"));
  }

  let quiz;
  try {
    quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      return res.status(400).json(formatMessage(false, "Invalid quiz id"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz"));
  }

  let course;
  try {
    course = await Course.findById(quiz.course);
    if (!course) {
      return res
        .status(400)
        .json(formatMessage(false, "Invalid course id in quiz"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz course"));
  }

  //Check if instructor teaches course
  if (course.instructor.toString() !== instructor._id.toString()) {
    return res
      .status(403)
      .json(formatMessage(false, "Instructor does not teach course"));
  }

  return res.status(200).json(formatMessage(true, "Quiz found", quiz));
});

//@route  GET api/quizzes/course/instructed/:courseId
//@desc   Allow instructor get all quizzes for a course they teach
//@access Private
const getQuizzesForInstructedCourse = asyncHandler(async (req, res) => {
  //Check if valid user
  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user"));
  }

  //Check if valid course
  let course;
  try {
    course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(400).json(formatMessage(false, "Invalid course id"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding course"));
  }

  //Check if instructor teaches course
  if (course.instructor.toString() !== instructor._id.toString()) {
    return res
      .status(403)
      .json(formatMessage(false, "Instructor does not teach course"));
  }

  //Get quizzes for course
  try {
    const quizzes = await Quiz.find({ course: req.params.courseId });
    if (!quizzes) {
      return res.status(400).json(formatMessage(false, "Invalid course"));
    }
    return res.status(200).json(
      formatMessage(
        true,
        "Quizzes found",
        quizzes.map((quiz) => {
          return {
            quizId: quiz._id,
            quizName: quiz.quizName,
            startTime: quiz.startTime,
            endTime: quiz.endTime,
          };
        })
      )
    );
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quizzes for course"));
  }
});

//@route  GET api/quizzes/course/enrolled/:courseId
//@desc   Allow student to get all quizzes for a course they are enrolled in
//@access Private
const getQuizzesForEnrolledCourse = asyncHandler(async (req, res) => {
  //Check if valid user
  let student;
  try {
    student = await User.findOne({ email: req.session.email });
    if (!student) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (student.type !== "student") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user"));
  }

  //Check if valid course
  let course;
  try {
    course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(400).json(formatMessage(false, "Invalid course id"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding course"));
  }

  //Check if student is enrolled in course
  if (
    !student.courses.some(
      (course) => course.courseId.toString() === req.params.courseId.toString()
    )
  ) {
    return res
      .status(403)
      .json(formatMessage(false, "Student not enrolled in course"));
  }

  const formattedQuizzes = [];
  //Get quizzes for course
  for (let i = 0; i < course.quizzes.length; i++) {
    try {
      const quiz = await Quiz.findById(course.quizzes[i]);
      if (!quiz) {
        return res.status(400).json(formatMessage(false, "Invalid quiz id"));
      }
      const currentDateTime = new Date();
      let currentQuizStatus = "";
      if (currentDateTime < quiz.startTime) {
        currentQuizStatus = "Upcoming";
      } else if (currentDateTime > quiz.endTime) {
        currentQuizStatus = "Past";
      } else {
        currentQuizStatus = "Active";
      }
      formattedQuizzes.push({
        quizId: quiz._id,
        quizName: quiz.quizName,
        status: currentQuizStatus,
        startTime: quiz.startTime,
        endTime: quiz.endTime,
      });
    } catch (error) {
      return res
        .status(400)
        .json(
          formatMessage(false, "Mongoose error finding quizzes for course")
        );
    }
  }

  return res
    .status(200)
    .json(formatMessage(true, "Quizzes found", formattedQuizzes));
});

//@route  PATCH api/quizzes
//@desc   Allow instructor to update a quiz (not all fields)
//@access Private
const basicUpdateQuiz = asyncHandler(async (req, res) => {
  const { quizId, newQuizName, newStartTime, newEndTime } = req.body;

  //Check if valid user
  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user"));
  }

  //Verify all fields exist
  if (!quizId || !newQuizName || !newStartTime || !newEndTime) {
    return res.status(400).json(formatMessage(false, "Missing fields"));
  }

  //Convert startTime and endTime to Date objects
  const startTimeConverted = new Date(newStartTime);
  const endTimeConverted = new Date(newEndTime);

  //Verify startTime and endTime are valid dates and startTime is before endTime
  if (
    isNaN(startTimeConverted) ||
    isNaN(endTimeConverted) ||
    newStartTime >= newEndTime
  ) {
    return res
      .status(400)
      .json(formatMessage(false, "Invalid start and/or end time"));
  }

  let quiz;
  try {
    quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(400).json(formatMessage(false, "Invalid quiz id"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz"));
  }

  //Check if there is a pre-existing quiz with new name
  try {
    const existingQuiz = await Quiz.findOne({
      $and: [{ quizName: newQuizName }, { course: quiz.course }],
    });
    if (existingQuiz) {
      return res.status(400).json(formatMessage(false, "Quiz name taken"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding existing quiz"));
  }

  let course;
  try {
    course = await Course.findById(quiz.course);
    if (!course) {
      return res
        .status(400)
        .json(formatMessage(false, "Invalid course id in quiz"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz course"));
  }

  //Check if instructor teaches course
  if (course.instructor.toString() !== instructor._id.toString()) {
    return res
      .status(403)
      .json(formatMessage(false, "Instructor does not teach course"));
  }

  //Update quiz
  quiz.quizName = newQuizName;
  quiz.startTime = startTimeConverted;
  quiz.endTime = endTimeConverted;
  await quiz.save();

  return res
    .status(200)
    .json(formatMessage(true, "Quiz updated successfully"));
});

//@route  PATCH api/quizzes/question
//@desc   Allow instructor to edit or remove a question from a quiz
//@access Private
const updateQuizQuestion = asyncHandler(async (req, res) => {
  const { quizId, action, question } = req.body;

  //Check if valid user
  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user"));
  }

  //Verify all fields exist
  if (
    !quizId ||
    !question ||
    !action ||
    (action !== "edit" && action !== "remove")
  ) {
    return res
      .status(400)
      .json(formatMessage(false, "Missing/invalid fields"));
  }

  //Verify valid question
  if (action === "edit") {
    if (!question._id || !question.type || !question.question) {
      return res
        .status(400)
        .json(formatMessage(false, "Missing fields in question"));
    }
  } else {
    //assume action === "remove", since we checked that earlier
    if (!question._id || !question.type) {
      return res
        .status(400)
        .json(formatMessage(false, "Missing fields in question"));
    }
  }

  let quiz;
  try {
    quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(400).json(formatMessage(false, "Invalid quiz id"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz"));
  }

  let course;
  try {
    course = await Course.findById(quiz.course);
    if (!course) {
      return res
        .status(400)
        .json(formatMessage(false, "Invalid course id in quiz"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz course"));
  }

  //Check if instructor teaches course
  if (course.instructor.toString() !== instructor._id.toString()) {
    return res
      .status(403)
      .json(formatMessage(false, "Instructor does not teach course"));
  }

  //Check if question exists in quiz
  const questionIndex = quiz.questions.findIndex(
    (currQuestion) =>
      currQuestion.question.toString() === question._id &&
      currQuestion.type === question.type
  );
  if (questionIndex === -1) {
    return res
      .status(400)
      .json(formatMessage(false, "Question not found in quiz"));
  }

  //Edit or remove question
  if (action === "remove") {
    try {
      switch (question.type) {
        case "MCQ":
          await MCQ.findByIdAndDelete(question._id);
          break;
        case "MSQ":
          await MSQ.findByIdAndDelete(question._id);
          break;
        case "CLO":
          await CLO.findByIdAndDelete(question._id);
          break;
        case "OEQ":
          await OEQ.findByIdAndDelete(question._id);
          break;
        default:
          return res
            .status(400)
            .json(formatMessage(false, "Invalid question type"));
      }
    } catch (error) {
      return res
        .status(400)
        .json(formatMessage(false, "Mongoose error editing question"));
    }
    quiz.questions.splice(questionIndex, 1);
    await quiz.save();
    return res
      .status(200)
      .json(formatMessage(true, "Question removed successfully"));
  } else {
    //assume action === "edit", since we checked that earlier
    try {
      switch (question.type) {
        case "MCQ":
          const validMCQChoices = question.question.choices.every(
            (choice) => choice.id && choice.content
          );
          if (!validMCQChoices) {
            return res
              .status(400)
              .json(formatMessage(false, "Invalid choices in MCQ question"));
          }
          await MCQ.findByIdAndUpdate(question._id, question.question);
          break;
        case "MSQ":
          const validMSQChoices = question.question.choices.every(
            (choice) => choice.id && choice.content
          );
          if (!validMSQChoices) {
            return res
              .status(400)
              .json(formatMessage(false, "Invalid choices in MSQ question"));
          }
          await MSQ.findByIdAndUpdate(question._id, question.question);
          break;
        case "CLO":
          await CLO.findByIdAndUpdate(question._id, question.question);
          break;
        case "OEQ":
          await OEQ.findByIdAndUpdate(question._id, question.question);
          break;
        default:
          return res
            .status(400)
            .json(formatMessage(false, "Invalid question type"));
      }
    } catch (error) {
      return res.status(400).json(formatMessage(false, error.message));
    }
    return res
      .status(200)
      .json(formatMessage(true, "Question edited successfully"));
  }
});

//@route  POST api/quizzes/question
//@desc   Allow instructor to add (a) question(s) to a quiz
//@access Private
const addQuizQuestions = asyncHandler(async (req, res) => {
  const { quizId, questions } = req.body;

  //Check if valid user
  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user"));
  }

  //Verify all fields exist
  if (!quizId || !questions) {
    return res.status(400).json(formatMessage(false, "Missing fields"));
  }

  let quiz;
  try {
    quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(400).json(formatMessage(false, "Invalid quiz id"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz"));
  }

  let course;
  try {
    course = await Course.findById(quiz.course);
    if (!course) {
      return res
        .status(400)
        .json(formatMessage(false, "Invalid course id in quiz"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz course"));
  }

  //Check if instructor teaches course
  if (course.instructor.toString() !== instructor._id.toString()) {
    return res
      .status(403)
      .json(formatMessage(false, "Instructor does not teach course"));
  }

  //Create questions
  for (let i = 0; i < questions.length; i++) {
    let createdQuestion;
    try {
      switch (questions[i].type) {
        case "MCQ":
          const validMCQChoices = questions[i].question.choices.every(
            (choice) => choice.id && choice.content
          );
          if (!validMCQChoices) {
            return res
              .status(400)
              .json(formatMessage(false, "Invalid choices in MCQ question"));
          }
          createdQuestion = await MCQ.create(questions[i].question);
          break;
        case "MSQ":
          const validMSQChoices = questions[i].question.choices.every(
            (choice) => choice.id && choice.content
          );
          if (!validMSQChoices) {
            return res
              .status(400)
              .json(formatMessage(false, "Invalid choices in MSQ question"));
          }
          createdQuestion = await MSQ.create(questions[i].question);
          break;
        case "CLO":
          createdQuestion = await CLO.create(questions[i].question);
          break;
        case "OEQ":
          createdQuestion = await OEQ.create(questions[i].question);
          break;
        default:
          return res
            .status(400)
            .json(formatMessage(false, "Invalid question type"));
      }
    } catch (error) {
      return res
        .status(400)
        .json(formatMessage(false, "Mongoose error creating question"));
    }

    if (!createdQuestion) {
      return res
        .status(400)
        .json(formatMessage(false, "Question creation failed"));
    } else {
      try {
        quiz.questions.push({
          question: createdQuestion._id,
          type: questions[i].type,
        });
      } catch (error) {
        return res.status(400).json(formatMessage(false, error.message));
      }
    }
  }
  await quiz.save();
  return res
    .status(200)
    .json(formatMessage(true, "Questions added successfully"));
});

//@route  GET api/quizzes/:quizId/questions
//@desc   Allow any authenticated user to get any full quiz with questions
//@access Private
const getQuizObject = asyncHandler(async (req, res) => {
  let quiz;
  try {
    quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      return res.status(400).json(formatMessage(false, "Invalid quiz id"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz"));
  }

  //Get questions for quiz
  const formattedQuesions = [];
  for (let i = 0; i < quiz.questions.length; i++) {
    try {
      let question;
      switch (quiz.questions[i].type) {
        case "MCQ":
          question = await MCQ.findById(quiz.questions[i].question);
          break;
        case "MSQ":
          question = await MSQ.findById(quiz.questions[i].question);
          break;
        case "CLO":
          question = await CLO.findById(quiz.questions[i].question);
          break;
        case "OEQ":
          question = await OEQ.findById(quiz.questions[i].question);
          break;
        default:
          return res
            .status(400)
            .json(formatMessage(false, "Invalid question type"));
      }
      if (!question) {
        return res
          .status(400)
          .json(formatMessage(false, "Invalid question id"));
      }
      formattedQuesions.push({
        type: quiz.questions[i].type,
        question: question,
      });
    } catch (error) {
      return res
        .status(400)
        .json(formatMessage(false, "Mongoose error finding question"));
    }
  }

  let course;
  try {
    course = await Course.findById(quiz.course);
    if (!course) {
      return res
        .status(400)
        .json(formatMessage(false, "Invalid course id in quiz"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz course"));
  }

  return res.status(200).json(
    formatMessage(true, "Quiz found", {
      quizName: quiz.quizName,
      courseCode: course.courseCode,
      startTime: quiz.startTime,
      endTime: quiz.endTime,
      questions: formattedQuesions,
    })
  );
});

//@route  GET api/quizzes/upcoming/instructor
//@desc   Allow instructors to get all upcoming quizzes for courses they instruct
//@access Private
const getUpcomingQuizzesForInstructedCourses = asyncHandler(
  async (req, res) => {
    //Check if valid user
    let instructor;
    try {
      instructor = await User.findOne({ email: req.session.email });
      if (!instructor) {
        return res.status(400).json(formatMessage(false, "Invalid user"));
      } else if (instructor.type !== "instructor") {
        return res.status(400).json(formatMessage(false, "Invalid user type"));
      }
    } catch (error) {
      return res
        .status(400)
        .json(formatMessage(false, "Mongoose error finding user"));
    }

    let formattedQuizzes = [];
    //Get quizzes for every enrolled course
    for (let j = 0; j < instructor.courses.length; j++) {
      const accentColor = instructor.courses[j].accentColor;
      let course;
      try {
        course = await Course.findById(instructor.courses[j].courseId);
        if (!course) {
          return res
            .status(400)
            .json(formatMessage(false, "Invalid course id in quiz"));
        }
      } catch (error) {
        return res
          .status(400)
          .json(formatMessage(false, "Mongoose error finding quiz course"));
      }

      for (let i = 0; i < course.quizzes.length; i++) {
        try {
          const quiz = await Quiz.findById(course.quizzes[i]);
          if (!quiz) {
            return res
              .status(400)
              .json(formatMessage(false, "Invalid quiz id"));
          }
          const currentDateTime = new Date();
          if (currentDateTime < quiz.startTime) {
            formattedQuizzes.push({
              quizId: quiz._id,
              quizName: quiz.quizName,
              courseCode: course.courseCode,
              accentColor: accentColor,
              startTime: quiz.startTime,
              endTime: quiz.endTime,
            });
          }
        } catch (error) {
          return res
            .status(400)
            .json(
              formatMessage(false, "Mongoose error finding quizzes for course")
            );
        }
      }
    }

    return res
      .status(200)
      .json(formatMessage(true, "Upcoming quizzes found", formattedQuizzes));
  }
);

//@route  GET api/quizzes/upcoming/student
//@desc   Allow students to get all upcoming quizzes for courses they are enrolled in
//@access Private
const getUpcomingQuizzesForEnrolledCourses = asyncHandler(async (req, res) => {
  //Check if valid user
  let student;
  try {
    student = await User.findOne({ email: req.session.email });
    if (!student) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (student.type !== "student") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user"));
  }

  let formattedQuizzes = [];
  //Get quizzes for every enrolled course
  for (let j = 0; j < student.courses.length; j++) {
    const accentColor = student.courses[j].accentColor;
    let course;
    try {
      course = await Course.findById(student.courses[j].courseId);
      if (!course) {
        return res
          .status(400)
          .json(formatMessage(false, "Invalid course id in quiz"));
      }
    } catch (error) {
      return res
        .status(400)
        .json(formatMessage(false, "Mongoose error finding quiz course"));
    }

    for (let i = 0; i < course.quizzes.length; i++) {
      try {
        const quiz = await Quiz.findById(course.quizzes[i]);
        if (!quiz) {
          return res.status(400).json(formatMessage(false, "Invalid quiz id"));
        }
        const currentDateTime = new Date();
        if (currentDateTime < quiz.startTime) {
          formattedQuizzes.push({
            quizId: quiz._id,
            quizName: quiz.quizName,
            courseCode: course.courseCode,
            accentColor: accentColor,
            startTime: quiz.startTime,
            endTime: quiz.endTime,
          });
        }
      } catch (error) {
        return res
          .status(400)
          .json(
            formatMessage(false, "Mongoose error finding quizzes for course")
          );
      }
    }
  }

  return res
    .status(200)
    .json(formatMessage(true, "Upcoming quizzes found", formattedQuizzes));
});

//@route  GET api/quizzes/active/instructor
//@desc   Allow instructors to get all active quizzes for courses they instruct
//@access Private
const getActiveQuizzesForInstructedCourses = asyncHandler(async (req, res) => {
  //Check if valid user
  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user"));
  }

  let formattedQuizzes = [];
  //Get quizzes for every enrolled course
  for (let j = 0; j < instructor.courses.length; j++) {
    const accentColor = instructor.courses[j].accentColor;
    let course;
    try {
      course = await Course.findById(instructor.courses[j].courseId);
      if (!course) {
        return res
          .status(400)
          .json(formatMessage(false, "Invalid course id in quiz"));
      }
    } catch (error) {
      return res
        .status(400)
        .json(formatMessage(false, "Mongoose error finding quiz course"));
    }

    for (let i = 0; i < course.quizzes.length; i++) {
      try {
        const quiz = await Quiz.findById(course.quizzes[i]);
        if (!quiz) {
          return res.status(400).json(formatMessage(false, "Invalid quiz id"));
        }
        const currentDateTime = new Date();
        if (
          currentDateTime >= quiz.startTime &&
          currentDateTime <= quiz.endTime
        ) {
          formattedQuizzes.push({
            quizId: quiz._id,
            quizName: quiz.quizName,
            courseCode: course.courseCode,
            accentColor: accentColor,
            startTime: quiz.startTime,
            endTime: quiz.endTime,
          });
        }
      } catch (error) {
        return res
          .status(400)
          .json(
            formatMessage(false, "Mongoose error finding quizzes for course")
          );
      }
    }
  }

  return res
    .status(200)
    .json(formatMessage(true, "Upcoming quizzes found", formattedQuizzes));
});

//@route  GET api/quizzes/active/student
//@desc   Allow students to get all active quizzes for courses they are enrolled in
//@access Private
const getActiveQuizzesForEnrolledCourses = asyncHandler(async (req, res) => {
  //Check if valid user
  let student;
  try {
    student = await User.findOne({ email: req.session.email });
    if (!student) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (student.type !== "student") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user"));
  }

  let formattedQuizzes = [];
  //Get quizzes for every enrolled course
  for (let j = 0; j < student.courses.length; j++) {
    const accentColor = student.courses[j].accentColor;
    let course;
    try {
      course = await Course.findById(student.courses[j].courseId);
      if (!course) {
        return res
          .status(400)
          .json(formatMessage(false, "Invalid course id in quiz"));
      }
    } catch (error) {
      return res
        .status(400)
        .json(formatMessage(false, "Mongoose error finding quiz course"));
    }

    for (let i = 0; i < course.quizzes.length; i++) {
      try {
        const quiz = await Quiz.findById(course.quizzes[i]);
        if (!quiz) {
          return res.status(400).json(formatMessage(false, "Invalid quiz id"));
        }
        const currentDateTime = new Date();
        if (
          currentDateTime >= quiz.startTime &&
          currentDateTime <= quiz.endTime
        ) {
          formattedQuizzes.push({
            quizId: quiz._id,
            quizName: quiz.quizName,
            courseCode: course.courseCode,
            accentColor: accentColor,
            startTime: quiz.startTime,
            endTime: quiz.endTime,
          });
        }
      } catch (error) {
        return res
          .status(400)
          .json(
            formatMessage(false, "Mongoose error finding quizzes for course")
          );
      }
    }
  }

  return res
    .status(200)
    .json(formatMessage(true, "Upcoming quizzes found", formattedQuizzes));
});

export {
  createQuiz,
  getQuiz,
  getQuizzesForInstructedCourse,
  getQuizzesForEnrolledCourse,
  basicUpdateQuiz,
  updateQuizQuestion,
  addQuizQuestions,
  getQuizObject,
  getUpcomingQuizzesForEnrolledCourses,
  getUpcomingQuizzesForInstructedCourses,
  getActiveQuizzesForEnrolledCourses,
  getActiveQuizzesForInstructedCourses,
};
