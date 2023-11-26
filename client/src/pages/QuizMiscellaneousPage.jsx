import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useParams } from "react-router";
import { getQuiz } from "api/QuizApi";
import { createQuizReponse } from "api/QuizResponseApi";
import NavBar from "components/page_components/NavBar";
import { isStudentUserType } from "utils/CookieUtils";

const QuizMiscellaneousPage = () => {
  const isStudent = isStudentUserType();
  const { quizId } = useParams();
  const [quizObject, quizObjectSet] = useState();
  const navigate = useNavigate();

  const onStartQuiz = (e) => {
    e.preventDefault();

    const questionResponses = quizObject.questions.map((question) => {
      return {
        question: question.question._id,
        response: []
      };
    });

    console.log(questionResponses);

    createQuizReponse(quizId, questionResponses).then((payload) => {
      if (payload) {
        navigate("/quiz/" + quizId);
      } else {
        alert("Failed to start quiz");
      }
    });
  };

  useEffect(() => {
    if (!isStudent) {
      navigate("/quiz/" + quizId);
      return;
    } else {
      const timeoutId = setTimeout(() => {
        getQuiz(quizId).then((payload) => {
          quizObjectSet(payload);
        });
      }, 3000);

      // Cleanup function to clear the timeout in case the component unmounts before the delay is complete
      return () => clearTimeout(timeoutId);
    }
  }, [quizId]);

  return (
    <>
      <NavBar />
      <div className="min-h-screen w-full flex justify-center py-28 sm:py-36 bg-gray-100">
        <button
          className="btn-primary w-fit text-sm px-8 py-2 mt-2 place-self-end"
          style={{
            pointerEvents: quizObject ? "auto" : "none",
            opacity: quizObject ? 1 : 0.5,
          }}
          onClick={(e) => onStartQuiz(e)}
        >
          Start Quiz
        </button>
      </div>
    </>
  );
};

export default QuizMiscellaneousPage;