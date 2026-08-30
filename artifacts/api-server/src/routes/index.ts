import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import playersRouter from "./players";
import avatarRouter from "./avatar";
import chatRouter from "./chat";
import plazaRouter from "./plaza";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(playersRouter);
router.use(avatarRouter);
router.use(chatRouter);
router.use(plazaRouter);

export default router;
