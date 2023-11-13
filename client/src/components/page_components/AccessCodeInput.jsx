import SingleLineInput from "components/elements/SingleLineInput";

export default function AccessCodeInput({ inputRef }) {
  return (
    <div className="relative">
      <SingleLineInput ref={inputRef} label="Course access code" />
      <div
        className="absolute z-10 text-slate-500 text-center right-2 top-1/2 p-2.5 -translate-y-1/2 cursor-pointer hover:text-slate-600 hover:bg-gray-100 transition rounded-lg"
        onClick={() => {
          /* [Credit]: Random string generating function from https://stackoverflow.com/a/38622545 */
          inputRef.current.setValue(
            Math.random().toString(36).slice(2, 8).toUpperCase()
          );
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="h-4"
          fill="currentColor"
        >
          <path d="M19,24H14a5.006,5.006,0,0,1-5-5V14a5.006,5.006,0,0,1,5-5h5a5.006,5.006,0,0,1,5,5v5A5.006,5.006,0,0,1,19,24ZM14,11a3,3,0,0,0-3,3v5a3,3,0,0,0,3,3h5a3,3,0,0,0,3-3V14a3,3,0,0,0-3-3Zm0,2a1,1,0,1,0,1,1A1,1,0,0,0,14,13Zm5,5a1,1,0,1,0,1,1A1,1,0,0,0,19,18ZM9,7A1,1,0,1,0,8,6,1,1,0,0,0,9,7ZM7,9a1,1,0,1,0-1,1A1,1,0,0,0,7,9Zm-.22,6.826a1,1,0,0,0-.154-1.405,3.15,3.15,0,0,1-.251-.228L2.864,10.634a3.005,3.005,0,0,1,.029-4.243L6.453,2.88a2.98,2.98,0,0,1,2.106-.864h.022a2.981,2.981,0,0,1,2.115.893L14.2,6.465c.057.058.111.117.163.179A1,1,0,1,0,15.9,5.356c-.083-.1-.17-.194-.266-.292L12.12,1.505a5,5,0,0,0-7.071-.049L1.489,4.967a5.007,5.007,0,0,0-.049,7.071L4.951,15.6a4.865,4.865,0,0,0,.423.381,1,1,0,0,0,1.406-.153Z" />
        </svg>
      </div>
    </div>
  );
}
