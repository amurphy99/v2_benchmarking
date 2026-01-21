import Avatar from "@/pages/common//avatar/Avatar";

// --------------------------------------------------------------------
// AvatarView
// --------------------------------------------------------------------
// Returns a view of the animated avatar and its most recent message 
const AvatarView = ({ chatbotMessage }) => {
    return (
        <> <div className="my-[1rem] flex justify-center bg-blue-200 p-[1em] rounded-lg mx-[10%] overflow-y-scroll h-[10vh]"> {chatbotMessage} </div>
           <div className="h-[60vh] mt-[1em] w-full"> <Avatar/> </div> </>
    );   
}

export default AvatarView;